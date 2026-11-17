import { humanBotInput } from './human-bot.js';
// Deterministic normal combat policy, shared by play and calibration.
import { survivalInput } from '../bot-survival.js';
import { selfDamageEnabled } from './self-damage.js';
import { q, clamp, unit, overlap, blockedSegment } from './geometry.js';
import { stateArena, arenaCenter } from '../../content/arena.js';
import { hasArenaPhysics } from '../../content/floor.js';
import { compileMove } from './compiler.js';
import { enemyTargets } from './mechanics.js';
import { teleportAim } from './teleport-aim.js';
import { collisionRects, getStateMap } from '../map-state.js';
import { legalFighterPosition, routeOnFloor } from '../arena-physics.js';
import { hypot, square } from '../exact-math.js';
import { allWalls, circling } from './queries.js';
import { closestEnemy, hardMoveSlot, hardDefense } from './hard-bot.js';
import { tactical } from './bot-skill.js';
import { hardMovement, noteHardInput } from './bot-movement.js';
import {
  builtinsAvailable,
  builtinMovement,
  builtinOffense,
  builtinParry,
} from './bot-builtins.js';
import { shieldReady } from './shield.js';
import { flagDestination } from './flags.js';
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/**
 * Bot decisions use compiled affordances, not move names or recipe kinds.
 * `context`, when given, receives the target, chosen move and whether this tick's
 * movement is ordinary combat positioning rather than an objective or a setup.
 */
function normalInput(s, id, preferredSlot, context = {}) {
  const p = s.players.find((p) => p.id === id);
  if (!p || p.dead) return {};
  const foes = enemyTargets(s, p)
    .filter((o) => !o.dead && o.id !== id && (!s.teamBattle || o.team !== p.team))
    .sort(
      (a, b) => square(a.x - p.x) + square(a.y - p.y) - (square(b.x - p.x) + square(b.y - p.y)),
    );
  const flagGoal = flagDestination(s, p);
  const target = foes[0] || (flagGoal ? { ...flagGoal, vx: 0, vy: 0 } : null);
  if (!target) return {};
  const arena = stateArena(s),
    center = arenaCenter(arena);
  const phase = (s.tick + hashString(id) + (s.seed % 180)) % 180,
    distance = hypot(target.x - p.x, target.y - p.y),
    plans = p.loadout.map((m, i) => ({ m, i, plan: compileMove(m), r: p.moveResources[m.name] }));
  const available = plans.filter(
      (x) => x.r.ammo > 0 || !['charges', 'magazine'].includes(x.m.resource.kind),
    ),
    pending = available.find((x) => x.r.sequence === 1);
  const choice =
    pending ||
    available.find((candidate) => candidate.i === preferredSlot) ||
    available.filter((x) => x.r.cooldown === 0 && x.r.reload === 0 && x.r.sequence !== 2)[
      Math.floor(s.tick / 60) %
        Math.max(
          1,
          available.filter((x) => x.r.cooldown === 0 && x.r.reload === 0 && x.r.sequence !== 2)
            .length,
        )
    ] ||
    available[0];
  const fallback = builtinMovement(s, p, plans);
  if (!choice && !flagGoal && !fallback)
    return { x: 0, y: 0, aimX: target.x, aimY: target.y, heldSlots: [], pressedSlots: [] };
  // Exhausted CTF loadouts still provide routing hints, but cannot cast.
  const { m, i, plan, r } = fallback || choice || plans[0],
    desired = plan.affordances.preferredDistance,
    [dx, dy] = unit(target.x - p.x, target.y - p.y);
  Object.assign(context, { target: foes[0], move: m, plan, combat: !flagGoal });
  let mx = dx * (distance > desired ? 1 : distance < desired - 25 ? -1 : 0),
    my = dy * (distance > desired ? 1 : distance < desired - 25 ? -1 : 0),
    canFire = distance < Math.max(plan.affordances.range + 13, desired + 40);
  if (plan.affordances.setup === 'pair' && r.sequence === 1) {
    const anchor = s.entities.find((e) => e.id === r.anchors[0]);
    if (anchor) {
      const side = p.spawnIndex % 2 ? 1 : -1,
        gx = clamp(anchor.x - dy * side * (m.setup.minDistance + 30), 40, arena.width - 40),
        gy = clamp(anchor.y + dx * side * (m.setup.minDistance + 30), 40, arena.height - 40);
      [mx, my] = unit(gx - p.x, gy - p.y);
      context.combat = false;
      canFire = hypot(p.x - anchor.x, p.y - anchor.y) >= m.setup.minDistance + 4;
    }
  } else if (distance > 80 && phase < 100 && !plan.affordances.setup.includes('pair')) {
    const side = p.spawnIndex % 2 ? 1 : -1;
    mx -= dy * side * 0.25;
    my += dx * side * 0.25;
  }
  if (s.mode === 'hill' && distance > 180) {
    [mx, my] = unit(center.x - p.x, center.y - p.y);
    context.combat = false;
  }
  // A hurt fighter walks to a health item close by.
  const pack =
    p.hp < p.maxHp * 0.6 &&
    s.items
      ?.filter((it) => it.kind === 'health' && square(it.x - p.x) + square(it.y - p.y) < 300 * 300)
      .sort(
        (a, b) =>
          square(a.x - p.x) + square(a.y - p.y) - (square(b.x - p.x) + square(b.y - p.y)) ||
          a.id - b.id,
      )[0];
  if (pack) {
    [mx, my] = unit(pack.x - p.x, pack.y - p.y);
    context.combat = false;
  }
  if (flagGoal) [mx, my] = unit(flagGoal.x - p.x, flagGoal.y - p.y);
  const ws = allWalls(s);
  if (ws.some((w) => overlap(p.x + mx * 24, p.y + my * 24, 13, w))) {
    const side = p.spawnIndex % 2 ? 1 : -1;
    [mx, my] = [-dy * side, dx * side];
    if (ws.some((w) => overlap(p.x + mx * 24, p.y + my * 24, 13, w))) [mx, my] = [-mx, -my];
  }
  // Cheap finite perception, sampled on a three-tick reaction cadence.
  const incoming =
    s.tick % 3 === 0 &&
    s.entities.some(
      (e) =>
        e.owner !== id &&
        !e.warning &&
        (!s.teamBattle || s.players.find((o) => o.id === e.owner)?.team !== p.team) &&
        square(e.x - p.x) + square(e.y - p.y) < 65 * 65,
    );
  const shield =
      incoming &&
      s.shieldEnabled !== false &&
      phase % 4 === 0 &&
      p.shield > 30 &&
      (!builtinsAvailable(s) || shieldReady(s, p)),
    dash =
      incoming &&
      s.dashEnabled !== false &&
      phase % 4 === 1 &&
      !circling(s, id) &&
      (!builtinsAvailable(s) ||
        (!p.dashCooldown && !p.dashTicks && !p.shielding && !p.shieldRelease));
  if (
    selfDamageEnabled(m, s) &&
    s.entities.some(
      (e) =>
        e.owner === id && e.move.name === m.name && e.ttl < 20 && hypot(e.x - p.x, e.y - p.y) < 85,
    )
  ) {
    mx = -dx;
    my = -dy;
    context.combat = false;
  }
  const map = getStateMap(s);
  if (hasArenaPhysics(map)) {
    const objective =
      flagGoal ||
      pack ||
      (s.mode === 'hill' && hypot(p.x - center.x, p.y - center.y) > 55 ? center : target);
    const routeNeeded =
      objective !== target ||
      distance > desired + 30 ||
      !legalFighterPosition(map, ws, p.x + mx * 35, p.y + my * 35);
    if (routeNeeded) {
      const path = routeOnFloor(map, ws, p, objective);
      if (path.length) {
        let waypoint =
          path[hypot(path[0][0] - p.x, path[0][1] - p.y) > 24 ? 0 : Math.min(1, path.length - 1)];
        if (flagGoal && path.length <= 2 && directFloorPath(map, ws, p, flagGoal))
          waypoint = [flagGoal.x, flagGoal.y];
        const brake = map.physics ? 4 : 0;
        [mx, my] = unit(
          waypoint[0] - p.x - (p.walkMomentumX || 0) * brake,
          waypoint[1] - p.y - (p.walkMomentumY || 0) * brake,
        );
      }
    } else if (map.physics) {
      mx -= p.walkMomentumX * 0.12;
      my -= p.walkMomentumY * 0.12;
    }
  }
  const aimX = q(target.x + target.vx * 2),
    aimY = q(target.y + target.vy * 2),
    clear =
      plan.affordances.setup === 'pair' ||
      !blockedSegment(p.x, p.y, target.x, target.y, collisionRects(s));
  const input = {
    x: mx,
    y: my,
    aimX,
    aimY,
    shield,
    dash,
    heldSlots: !fallback && choice && canFire && clear && m.activation.mode === 'hold' ? [i] : [],
    pressedSlots:
      !fallback &&
      choice &&
      canFire &&
      clear &&
      m.activation.mode !== 'hold' &&
      r.cooldown === 0 &&
      r.recovery === 0
        ? [i]
        : [],
  };
  return !fallback && choice?.m.casterAction.kind === 'teleport'
    ? teleportInput(s, p, choice, target, input)
    : input;
}

/**
 * `movementStyle` is an experiment-only hard-bot movement style; live play omits it.
 * @param {{ movementStyle?: string }} [options]
 */
export function botInput(state, id, options = {}) {
  const player = state.players.find((p) => p.id === id);
  if (!player || player.dead) return {};
  if (state.botDifficulty !== 'moderate') return decideBotInput(state, id, options);
  const input = humanBotInput(state, player, () => decideBotInput(state, id, options));
  noteHardInput(state, player, input);
  return input;
}
function decideBotInput(state, id, options = {}) {
  const { movementStyle } = options;
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player || player.dead) return {};
  const selected = tactical(state) ? hardMoveSlot(state, player) : undefined;
  const context = {};
  let input = normalInput(state, id, selected, context);
  if (tactical(state)) {
    if (selected === undefined) {
      input.pressedSlots = [];
      if (player.channel == null) input.heldSlots = [];
    }
    input = hardMovement(state, player, input, context, movementStyle);
    input = hardDefense(state, player, input);
  }
  if (!tactical(state) && state.tick % 3 === 0) input = builtinParry(state, player, input) || input;
  const target = closestEnemy(state, player);
  input = builtinOffense(state, player, target, input);
  const safe = survivalInput(state, player, input, getStateMap(state), allWalls(state));
  if (safe !== input) {
    // Keep shooting while escaping, but do not teleport toward an outside foe.
    const stays = (slot) => player.loadout[slot]?.casterAction.kind !== 'teleport';
    safe.pressedSlots = safe.pressedSlots?.filter(stays);
    safe.heldSlots = safe.heldSlots?.filter(stays);
  }
  if (tactical(state) && state.botDifficulty !== 'moderate') noteHardInput(state, player, safe);
  return safe;
}
/** A bot teleports to a legal point beside its goal instead of aiming at the target. */
function teleportInput(state, player, choice, target, input) {
  const aim = teleportAim(state, player, choice.m, target);
  if (aim)
    return {
      ...input,
      aimX: aim.x,
      aimY: aim.y,
      pressedSlots:
        hypot(aim.x - player.x, aim.y - player.y) > 70 &&
        player.moveResources[choice.m.name].cooldown === 0
          ? [choice.i]
          : [],
      heldSlots: [],
    };
  return { ...input, pressedSlots: [], heldSlots: [] };
}

function directFloorPath(map, walls, player, goal) {
  const distance = hypot(goal.x - player.x, goal.y - player.y),
    steps = Math.max(1, Math.ceil(distance / 8));
  for (let index = 0; index <= steps; index++)
    if (
      !legalFighterPosition(
        map,
        walls,
        player.x + ((goal.x - player.x) * index) / steps,
        player.y + ((goal.y - player.y) * index) / steps,
      )
    )
      return false;
  return true;
}
