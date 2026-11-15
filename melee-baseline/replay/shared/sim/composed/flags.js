// CTF objective state, ordered transitions, team outcomes and safe home respawns.
import { FLAG_TOUCH_RADIUS } from '../../content/ctf.js';
import { floorSupports } from '../../content/floor.js';
import { TEAMS } from '../teams.js';
import { getStateMap } from '../map-state.js';
import { findSafeSpawn, safeSpawnPoint } from '../safe-spawn.js';
import { survivalBounds } from '../survival.js';
import { legalFighterPosition, routeOnFloor } from '../arena-physics.js';
import { hypot, square } from '../exact-math.js';
import { dir, q, staticShapeHit } from './geometry.js';
import { allWalls } from './queries.js';
import { touchesPickup } from './pickup.js';

export const FLAG_RETURN_TICKS = 300;
export const CAPTURES_TO_WIN = 3;

export function startFlags(state) {
  if (state.mode !== 'ctf') return;
  const teams = TEAMS.filter((team) => state.players.some((player) => player.team === team.id)),
    map = getStateMap(state),
    layout = map.ctfBases?.[teams.length];
  if (!state.teamBattle || teams.length < 2 || !map.supportedModes?.includes('ctf') || !layout)
    throw Error('Capture the flag requires at least two occupied teams and a supported map.');
  state.flagBases = teams.map((team, index) => ({ team: team.id, ...layout[index] }));
  state.flags = state.flagBases.map((base) => ({
    ...base,
    status: 'home',
    carrierId: null,
    returnTicks: 0,
    changedTick: state.tick,
  }));
}

const baseOf = (state, team) => state.flagBases.find((base) => base.team === team);
const distance = (a, b) => square(a.x - b.x) + square(a.y - b.y);
function flagGeometry(state) {
  const map = getStateMap(state),
    rects = [...allWalls(state), ...map.hazards];
  return {
    map,
    rects,
    rules: {
      ...survivalBounds(state, FLAG_TOUCH_RADIUS, map),
      radius: FLAG_TOUCH_RADIUS,
      rects,
      blocked: (x, y) => !floorSupports(map, x, y, FLAG_TOUCH_RADIUS),
    },
  };
}
function routeIsLegal(map, rects, start, goal) {
  const route = routeOnFloor(map, rects, start, goal);
  if (!route.length) return false;
  const points = [start, ...route.map(([x, y]) => ({ x, y })), goal];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index],
      steps = Math.max(1, Math.ceil(hypot(b.x - a.x, b.y - a.y) / 8));
    for (let part = 0; part <= steps; part++)
      if (
        !legalFighterPosition(
          map,
          rects,
          a.x + ((b.x - a.x) * part) / steps,
          a.y + ((b.y - a.y) * part) / steps,
        )
      )
        return false;
  }
  return true;
}
function accessible(state, point, geometry) {
  return (
    safeSpawnPoint(point.x, point.y, geometry.rules) &&
    state.flagBases.some((base) => routeIsLegal(geometry.map, geometry.rects, point, base))
  );
}
const dropOffsets = Array.from({ length: 81 }, (_, index) => ({
  x: ((index % 9) - 4) * 16,
  y: (Math.floor(index / 9) - 4) * 16,
  index,
})).sort((a, b) => square(a.x) + square(a.y) - square(b.x) - square(b.y) || a.index - b.index);
function dropPoint(state, flag, carrier, geometry) {
  const origin = carrier && safeSpawnPoint(carrier.x, carrier.y, geometry.rules) ? carrier : flag;
  for (const offset of dropOffsets) {
    const point = { x: q(origin.x + offset.x), y: q(origin.y + offset.y) };
    if (accessible(state, point, geometry)) return point;
  }
  return null;
}
function returnFlag(state, flag, reason, playerId) {
  const base = baseOf(state, flag.team);
  Object.assign(flag, {
    status: 'home',
    x: base.x,
    y: base.y,
    carrierId: null,
    returnTicks: 0,
    changedTick: state.tick,
  });
  state.events.push({
    type: 'flag-return',
    team: flag.team,
    flagTeam: flag.team,
    reason,
    x: flag.x,
    y: flag.y,
    ...(playerId ? { playerId } : {}),
  });
}
function dropFlag(state, flag, carrier, geometry) {
  const point = dropPoint(state, flag, carrier, geometry);
  if (!point) return returnFlag(state, flag, 'no-safe-drop', carrier?.id);
  Object.assign(flag, {
    ...point,
    status: 'dropped',
    carrierId: null,
    returnTicks: FLAG_RETURN_TICKS,
    changedTick: state.tick,
  });
  state.events.push({
    type: 'flag-drop',
    team: carrier?.team,
    flagTeam: flag.team,
    reason: 'carrier-left',
    x: flag.x,
    y: flag.y,
    ...(carrier ? { playerId: carrier.id } : {}),
  });
}

/** Damage precedes invalid carriers, expiry, friendly returns, thefts, then captures. */
export function advanceFlags(state) {
  if (state.mode !== 'ctf') return;
  const geometry = flagGeometry(state);
  for (const flag of state.flags)
    if (flag.status === 'carried') {
      const carrier = state.players.find((player) => player.id === flag.carrierId);
      if (!carrier || carrier.dead) dropFlag(state, flag, carrier, geometry);
      // Retain the last safe point while the carrier crosses a narrow bridge or teleports.
      else if (safeSpawnPoint(carrier.x, carrier.y, geometry.rules)) {
        flag.x = carrier.x;
        flag.y = carrier.y;
      }
    }
  for (const flag of state.flags)
    if (flag.status === 'dropped') {
      if (!accessible(state, flag, geometry)) returnFlag(state, flag, 'unsafe');
      else if (flag.changedTick < state.tick && --flag.returnTicks <= 0)
        returnFlag(state, flag, 'expired');
    }
  for (const flag of state.flags)
    if (flag.status === 'dropped') {
      const friendly = state.players.find(
        (player) => !player.dead && player.team === flag.team && touchesPickup(player, flag),
      );
      if (friendly) returnFlag(state, flag, 'friendly', friendly.id);
    }
  for (const flag of state.flags)
    if (flag.status !== 'carried' && flag.changedTick < state.tick) {
      const carrier = state.players.find(
        (player) =>
          !player.dead &&
          player.team !== flag.team &&
          touchesPickup(player, flag) &&
          !state.flags.some((other) => other.carrierId === player.id),
      );
      if (!carrier) continue;
      Object.assign(flag, {
        status: 'carried',
        carrierId: carrier.id,
        x: carrier.x,
        y: carrier.y,
        returnTicks: 0,
        changedTick: state.tick,
      });
      state.events.push({
        type: 'flag-pickup',
        playerId: carrier.id,
        team: carrier.team,
        flagTeam: flag.team,
        x: carrier.x,
        y: carrier.y,
      });
    }
  for (const base of state.flagBases) {
    if (state.flags.find((flag) => flag.team === base.team).status !== 'home') continue;
    for (const carrier of state.players) {
      if (carrier.dead || carrier.team !== base.team || !touchesPickup(carrier, base)) continue;
      const flag = state.flags.find(
        (candidate) => candidate.carrierId === carrier.id && candidate.changedTick < state.tick,
      );
      if (!flag) continue;
      state.teamScores[base.team]++;
      carrier.score++;
      returnFlag(state, flag, 'capture', carrier.id);
      state.events.push({
        type: 'flag-capture',
        playerId: carrier.id,
        team: carrier.team,
        flagTeam: flag.team,
        x: base.x,
        y: base.y,
      });
    }
  }
}

export function flagOutcome(state) {
  const teams = state.flagBases.map((base) => base.team),
    active = teams.filter((team) =>
      state.players.some((player) => player.team === team && (!player.dead || player.respawn > 0)),
    ),
    highest = Math.max(...teams.map((team) => state.teamScores[team]));
  if (active.length > 1 && highest < CAPTURES_TO_WIN && state.tick < state.timeLimit * 30)
    return { ended: false, winnerTeam: null, winners: [] };
  const leaders =
      active.length <= 1 ? active : teams.filter((team) => state.teamScores[team] === highest),
    winnerTeam = leaders.length === 1 ? leaders[0] : null;
  return {
    ended: true,
    winnerTeam,
    winners: winnerTeam
      ? state.players.filter((player) => player.team === winnerTeam).map((player) => player.id)
      : [],
  };
}

/** Home is recovered before a carrier attempts a capture; ties keep canonical team order. */
export function flagDestination(state, player) {
  if (state.mode !== 'ctf') return null;
  const own = state.flags.find((flag) => flag.team === player.team),
    carried = state.flags.find((flag) => flag.carrierId === player.id);
  if (own.status !== 'home')
    return own.status === 'carried'
      ? state.players.find((candidate) => candidate.id === own.carrierId) || own
      : own;
  if (carried) return baseOf(state, player.team);
  return (
    state.flags
      .filter((flag) => flag.team !== player.team && flag.status !== 'carried')
      .sort((a, b) => distance(a, player) - distance(b, player))[0] || baseOf(state, player.team)
  );
}

/** Local candidates use the same floor/cover/player/effect safety rules as ordinary respawns. */
export function chooseFlagSpawn(state, player) {
  const base = baseOf(state, player.team),
    map = getStateMap(state),
    bounds = survivalBounds(state, 13, map),
    entities = state.entities.filter(
      (entity) => !entity.removed && (entity.ttl === undefined || entity.ttl > 0),
    ),
    candidates = [[base.x, base.y]];
  for (const radius of [40, 80, 120, 160])
    for (let angle = 0; angle < 32; angle += 4) {
      const [dx, dy] = dir(angle);
      candidates.push([q(base.x + dx * radius), q(base.y + dy * radius)]);
    }
  return findSafeSpawn({
    ...bounds,
    minX: Math.max(bounds.minX, base.x - 160),
    maxX: Math.min(bounds.maxX, base.x + 160),
    minY: Math.max(bounds.minY, base.y - 160),
    maxY: Math.min(bounds.maxY, base.y + 160),
    radius: 13,
    candidates,
    rects: [...allWalls(state), ...map.hazards],
    circles: state.players
      .filter((other) => other !== player && !other.dead)
      .map((other) => ({ x: other.x, y: other.y, radius: 19 })),
    blocked: (x, y) =>
      !floorSupports(map, x, y, 13) ||
      entities.some(
        (entity) =>
          entity.age >= entity.arm &&
          ((entity.force &&
            square(x - entity.x) + square(y - entity.y) < square(entity.force.radius + 13)) ||
            (entity.geometries || [entity.geometry]).some(
              (shape) =>
                shape &&
                staticShapeHit(
                  shape,
                  entity.x,
                  entity.y,
                  entity.angle || 0,
                  x,
                  y,
                  13,
                  entity.linkTo,
                ),
            )),
      ),
  });
}
