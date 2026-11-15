// The Classic engine: matches whose moves are one of eight fixed kinds (format 1).
import { getMechanicsVersion } from '../../protocol/versions.js';
import { survivalBounds } from '../survival.js';
import { survivalInput } from '../bot-survival.js';
import { BASE_MOVES } from '../../content/classic/moves.js';
import { simulationOptions, simulationSpawn, simulationComparison } from '../calibration-rules.js';
import { stateArena } from '../../content/arena.js';
import { CLASSIC_STAGES as STAGES } from '../../content/maps/classic-stages.js';
import { getMap } from '../../content/maps/catalog.js';
import { findSafeSpawn, safeSpawnPoint } from '../safe-spawn.js';
import { normalizeHealthPercent, normalizeHandicapPercent, maxHealth } from '../health.js';
import {
  normalizeTeam,
  leastPopulatedTeam,
  resolveAppearance,
  relationDamageScale,
  recordTeamKill,
  tickTeamHill,
  teamOutcome,
} from '../teams.js';
import { hypot, square } from '../exact-math.js';
import { hashState, unlistedFields } from '../state-hash.js';
import { CLASSIC_STATE } from './state-fields.js';
const ENGINE_BUILD = getMechanicsVersion('classic').build;
export const TICK_RATE = 30,
  MAX_ENTITIES = 96;
const RADIUS = 13,
  q = (n) => Math.round(n * 256) / 256,
  clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (v, f = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
// Integer direction table avoids platform-dependent trigonometric functions.
const DIR = [
  [1024, 0],
  [1004, 200],
  [946, 392],
  [851, 569],
  [724, 724],
  [569, 851],
  [392, 946],
  [200, 1004],
  [0, 1024],
  [-200, 1004],
  [-392, 946],
  [-569, 851],
  [-724, 724],
  [-851, 569],
  [-946, 392],
  [-1004, 200],
  [-1024, 0],
  [-1004, -200],
  [-946, -392],
  [-851, -569],
  [-724, -724],
  [-569, -851],
  [-392, -946],
  [-200, -1004],
  [0, -1024],
  [200, -1004],
  [392, -946],
  [569, -851],
  [724, -724],
  [851, -569],
  [946, -392],
  [1004, -200],
];
function unit(x, y) {
  const d = Math.sqrt(x * x + y * y);
  return d > 0 ? [q(x / d), q(y / d)] : [1, 0];
}
function inside(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function overlap(x, y, radius, r) {
  const dx = x - clamp(x, r.x, r.x + r.w),
    dy = y - clamp(y, r.y, r.y + r.h);
  return dx * dx + dy * dy < radius * radius;
}
export function createMatch(options = {}) {
  if (options.mode === 'simulation') options = simulationOptions(options);
  const {
    players = [],
    stage = 'foundry',
    mode = 'timed',
    timeLimit = 120,
    lives = 3,
    shrinkAfter = 60,
    seed = 1,
  } = options;
  if (players.length < 2 || players.length > 4) throw new Error('Matches require 2–4 players');
  const spawns = [
      [120, 120],
      [840, 520],
      [840, 120],
      [120, 520],
    ],
    healthPercent = normalizeHealthPercent(options.healthPercent);
  const state = {
    formatVersion: 1,
    engineBuild: ENGINE_BUILD,
    healthPercent,
    seed: seed >>> 0,
    tick: 0,
    stage: mode === 'simulation' || STAGES.some((s) => s.id === stage) ? stage : 'foundry',
    mode: ['simulation', 'timed', 'lives', 'hill'].includes(mode) ? mode : 'timed',
    timeLimit: clamp(finite(timeLimit, 120), 10, 600),
    shrinkAfter: clamp(finite(shrinkAfter, 60), 0, 600),
    ring: 0,
    ended: false,
    winner: null,
    nextEntityId: 1,
    entities: [],
    events: [],
    players: players.map((p, i) => {
      const handicapPercent = normalizeHandicapPercent(p.handicapPercent),
        maxHp = maxHealth(healthPercent, handicapPercent);
      return {
        id: String(p.id),
        name: String(p.name || `Player ${i + 1}`),
        color: p.color || ['#78f0c5', '#f574a5', '#ffce5c', '#76bcff'][i],
        secondaryColor: p.secondaryColor || '#f574a5',
        look: p.look || 'round',
        x: spawns[i][0],
        y: spawns[i][1],
        vx: 0,
        vy: 0,
        hp: maxHp,
        maxHp,
        handicapPercent,
        shield: 100,
        shielding: false,
        shieldLocked: false,
        shieldRelease: 0,
        invuln: 30,
        dashCooldown: 0,
        dashTicks: 0,
        score: 0,
        kills: 0,
        deaths: 0,
        lives: clamp(Math.trunc(finite(lives, 3)), 1, 10),
        dead: false,
        respawn: 0,
        loadout: (p.loadout?.length ? p.loadout : BASE_MOVES.slice(0, 3)).slice(0, 5),
        cooldowns: Array(5).fill(0),
        uses: Array(5).fill(0),
        fatigue: Array(5).fill(0),
        aimX: 480,
        aimY: 320,
        spawnIndex: i,
        lastHit: null,
        lastHitTick: -9999,
      };
    }),
  };
  if (mode === 'simulation') {
    const map = getMap(state.stage, 'classic', options.mapRevision);
    Object.assign(state, { arenaWidth: map.width, arenaHeight: map.height });
    for (const p of state.players) [p.x, p.y] = simulationSpawn(state, p.spawnIndex);
  }
  if (options.roundNumber !== undefined) state.roundNumber = options.roundNumber;
  if (options.moveRefs !== undefined) state.moveRefs = structuredClone(options.moveRefs);
  if (options.survivalRevision === 2) state.survivalRevision = 2;
  if (options.teamBattle) {
    state.teamBattle = true;
    state.teamScores = {};
    state.winnerTeam = null;
    state.winners = [];
    const assigned = [];
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i],
        team = normalizeTeam(players[i].team ?? players[i].teamId) || leastPopulatedTeam(assigned);
      p.team = team;
      Object.assign(p, resolveAppearance({ ...p, teamColors: players[i].teamColors }, team));
      delete p.teamColors;
      assigned.push(p);
      state.teamScores[team] = 0;
    }
    if (Object.keys(state.teamScores).length < 2)
      throw new Error('Team battles require at least two opposing teams');
  }
  if (options.mechanicsVersion) {
    const map = getMap(stage || 'foundry', 'classic', options.mapRevision);
    state.mechanicsVersion = 'classic';
    state.mapRevision = map.revision;
  }
  return state;
}
function wallsFor(s, p) {
  return [
    ...getMap(s.stage, 'classic', s.mapRevision).walls,
    ...s.entities
      .filter((e) => e.kind === 'wall' && e.owner !== p.id && e.age >= e.windup)
      .map((e) => ({ x: e.x - e.radius, y: e.y - e.radius / 2, w: e.radius * 2, h: e.radius })),
  ];
}
function movePlayer(s, p, dx, dy) {
  const { width: WIDTH, height: HEIGHT } = stateArena(s);
  const walls = wallsFor(s, p);
  p.x = q(clamp(p.x + dx, 20 + RADIUS, WIDTH - 20 - RADIUS));
  for (const w of walls)
    if (overlap(p.x, p.y, RADIUS, w)) p.x = q(dx >= 0 ? w.x - RADIUS : w.x + w.w + RADIUS);
  p.y = q(clamp(p.y + dy, 20 + RADIUS, HEIGHT - 20 - RADIUS));
  for (const w of walls)
    if (overlap(p.x, p.y, RADIUS, w)) p.y = q(dy >= 0 ? w.y - RADIUS : w.y + w.h + RADIUS);
  p.x = q(clamp(p.x, 20 + RADIUS, WIDTH - 20 - RADIUS));
  p.y = q(clamp(p.y, 20 + RADIUS, HEIGHT - 20 - RADIUS));
}
function damage(s, target, amount, kx, ky, knockback, owner, move = null) {
  if (target.dead || target.invuln > 0) return false;
  if (s.teamBattle) {
    const scale = relationDamageScale(
      move,
      s.players.find((p) => p.id === owner),
      target,
      s,
    );
    if (scale === 0) return false;
    amount *= scale;
    knockback *= scale;
  }
  if (target.shielding) {
    target.shield = Math.max(0, q(target.shield - amount * 1.25));
    target.vx = q(target.vx + kx * knockback * 0.25);
    target.vy = q(target.vy + ky * knockback * 0.25);
    if (target.shield <= 0) {
      target.shieldLocked = true;
      target.shielding = false;
      target.shieldRelease = 8;
      s.events.push({ type: 'shieldbreak', x: target.x, y: target.y, playerId: target.id });
    }
    return true;
  }
  target.hp = Math.max(0, q(target.hp - amount));
  target.vx = q(target.vx + kx * knockback);
  target.vy = q(target.vy + ky * knockback);
  target.invuln = 8;
  target.lastHit = owner;
  target.lastHitTick = s.tick;
  s.events.push({
    type: 'hit',
    x: target.x,
    y: target.y,
    playerId: target.id,
    owner,
    damage: amount,
    color: move?.color || '#ffffff',
  });
  if (target.hp <= 0) {
    target.dead = true;
    target.deaths++;
    target.lives--;
    target.shielding = false;
    target.respawn = s.mode === 'lives' && target.lives <= 0 ? 0 : 60;
    const killer = s.players.find((p) => p.id === owner);
    if (s.teamBattle) recordTeamKill(s, target, killer);
    else if (killer && killer !== target) {
      killer.kills++;
      if (s.mode !== 'hill') killer.score++;
    }
    s.events.push({ type: 'kill', x: target.x, y: target.y, playerId: target.id, owner });
  }
  return true;
}
function spawn(s, p, move, dx, dy, offset = 0, index = 0) {
  const { width: WIDTH, height: HEIGHT } = stateArena(s);
  if (s.entities.length >= MAX_ENTITIES || s.entities.filter((e) => e.owner === p.id).length >= 24)
    return false;
  const rotate = DIR[(offset + 32) % 32];
  const ux = q((dx * rotate[0] - dy * rotate[1]) / 1024),
    uy = q((dx * rotate[1] + dy * rotate[0]) / 1024);
  let x = p.x + ux * 22,
    y = p.y + uy * 22;
  if (move.kind === 'nova' || move.kind === 'orbit') {
    x = p.x;
    y = p.y;
  }
  if (move.kind === 'trap' || move.kind === 'wall') {
    const dist = Math.min(210, hypot(p.aimX - p.x, p.aimY - p.y));
    const margin = 20 + move.radius;
    x = clamp(p.x + dx * dist, margin, WIDTH - margin);
    y = clamp(p.y + dy * dist, margin, HEIGHT - margin);
    if (getMap(s.stage, 'classic', s.mapRevision).walls.some((w) => overlap(x, y, move.radius, w)))
      return false;
  }
  // A projectile needs a clear launch point; a later collision is still a valid cast.
  if (
    ['projectile', 'spread', 'beam', 'boomerang'].includes(move.kind) &&
    (x < 20 ||
      x > WIDTH - 20 ||
      y < 20 ||
      y > HEIGHT - 20 ||
      getMap(s.stage, 'classic', s.mapRevision).walls.some((w) => overlap(x, y, move.radius, w)))
  )
    return false;
  s.entities.push({
    id: s.nextEntityId++,
    owner: p.id,
    kind: move.kind,
    x: q(x),
    y: q(y),
    originX: q(x),
    originY: q(y),
    vx: q(ux * move.speed),
    vy: q(uy * move.speed),
    dx: ux,
    dy: uy,
    radius: move.radius,
    ttl: move.duration + move.windup,
    age: 0,
    windup: move.windup,
    color: move.color,
    move,
    hit: [],
    index,
    angle: offset,
  });
  return true;
}
function cast(s, p, slot) {
  const m = p.loadout[slot];
  if (
    !m ||
    p.cooldowns[slot] > 0 ||
    p.shielding ||
    p.shieldRelease > 0 ||
    (m.limit === 'charges' && p.uses[slot] >= m.charges)
  )
    return;
  const fatigue = Math.min(4, p.fatigue[slot] + 1),
    move =
      m.limit === 'fatigue'
        ? { ...m, damage: Math.max(12, Math.round(m.damage / (1 + (fatigue - 1) * 0.22))) }
        : m;
  const [dx, dy] = unit(p.aimX - p.x, p.aimY - p.y),
    count = m.kind === 'spread' || m.kind === 'orbit' ? m.count : 1;
  let activated = false;
  for (let i = 0; i < count; i++)
    if (
      spawn(
        s,
        p,
        move,
        dx,
        dy,
        m.kind === 'spread' ? (i - Math.floor(count / 2)) * 2 : Math.floor((i * 32) / count),
        i,
      )
    )
      activated = true;
  if (!activated) return;
  p.cooldowns[slot] = m.cooldown;
  p.uses[slot]++;
  p.fatigue[slot] = fatigue;
  s.events.push({ type: 'cast', x: p.x, y: p.y, playerId: p.id, move: m });
}
function segmentHit(ax, ay, bx, by, p, r) {
  const dx = bx - ax,
    dy = by - ay,
    l = dx * dx + dy * dy,
    t = l ? clamp(((p.x - ax) * dx + (p.y - ay) * dy) / l, 0, 1) : 0;
  return square(p.x - ax - dx * t) + square(p.y - ay - dy * t) <= r * r;
}
function blockedSegment(ax, ay, bx, by, walls, r = 2) {
  const distance = Math.max(Math.abs(bx - ax), Math.abs(by - ay)),
    n = Math.max(1, Math.ceil(distance / 10));
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n,
      y = ay + ((by - ay) * i) / n;
    if (walls.some((w) => overlap(x, y, r, w))) return true;
  }
  return false;
}
function advanceEntity(s, e) {
  const { width: WIDTH, height: HEIGHT } = stateArena(s);
  e.age++;
  e.ttl--;
  if (e.age <= e.windup) return;
  const owner = s.players.find((p) => p.id === e.owner),
    m = e.move,
    walls = getMap(s.stage, 'classic', s.mapRevision).walls;
  let oldX = e.x,
    oldY = e.y;
  if (['projectile', 'spread', 'boomerang'].includes(e.kind)) {
    if (e.kind === 'boomerang' && e.age > e.windup + m.duration / 2 && owner && !owner.dead) {
      const [dx, dy] = unit(owner.x - e.x, owner.y - e.y);
      e.vx = q(dx * m.speed);
      e.vy = q(dy * m.speed);
    }
    e.x = q(e.x + e.vx);
    e.y = q(e.y + e.vy);
    if (
      e.x < 20 ||
      e.x > WIDTH - 20 ||
      e.y < 20 ||
      e.y > HEIGHT - 20 ||
      blockedSegment(oldX, oldY, e.x, e.y, walls, e.radius)
    ) {
      e.ttl = 0;
      return;
    }
  } else if (e.kind === 'orbit') {
    if (!owner || owner.dead) {
      e.ttl = 0;
      return;
    }
    const v = DIR[(Math.floor((e.age - e.windup) / 2) + e.angle) % 32];
    e.x = q(owner.x + (v[0] * 58) / 1024);
    e.y = q(owner.y + (v[1] * 58) / 1024);
  }
  for (const p of s.players) {
    if (p.id === e.owner || p.dead || e.hit.includes(p.id)) continue;
    let hit = false;
    if (e.kind === 'beam') {
      const length = clamp(m.speed * 32, 160, 520),
        bx = e.originX + e.dx * length,
        by = e.originY + e.dy * length;
      hit =
        segmentHit(e.originX, e.originY, bx, by, p, e.radius + RADIUS) &&
        !blockedSegment(e.originX, e.originY, p.x, p.y, walls);
    } else if (e.kind === 'wall')
      hit = overlap(p.x, p.y, RADIUS + 2, {
        x: e.x - e.radius,
        y: e.y - e.radius / 2,
        w: e.radius * 2,
        h: e.radius,
      });
    else hit = segmentHit(oldX, oldY, e.x, e.y, p, e.radius + RADIUS);
    if (hit) {
      const [dx, dy] = unit(p.x - e.x, p.y - e.y);
      if (damage(s, p, m.damage, dx, dy, m.knockback, e.owner, m)) {
        e.hit.push(p.id);
        if (['projectile', 'spread', 'trap'].includes(e.kind)) e.ttl = 0;
      }
    }
  }
  // Fire melts a rival ice wall. Other shots stop at created walls.
  if (['projectile', 'spread', 'boomerang'].includes(e.kind))
    for (const wall of s.entities) {
      if (
        wall.kind !== 'wall' ||
        wall.owner === e.owner ||
        wall.age <= wall.windup ||
        wall.ttl <= 0
      )
        continue;
      if (
        overlap(e.x, e.y, e.radius, {
          x: wall.x - wall.radius,
          y: wall.y - wall.radius / 2,
          w: wall.radius * 2,
          h: wall.radius,
        })
      ) {
        if (m.element === 'fire' && wall.move.element === 'ice') wall.ttl = 0;
        e.ttl = 0;
      }
    }
}
function respawn(s, p) {
  const spawns = [
      [120, 120],
      [840, 520],
      [840, 120],
      [120, 520],
    ],
    index = (p.spawnIndex + p.deaths) % 4,
    preferred =
      s.mode === 'simulation' ? simulationSpawn(s, p.spawnIndex, p.deaths) : spawns[index],
    stage = getMap(s.stage, 'classic', s.mapRevision);
  const rules = {
    ...survivalBounds(s, RADIUS),
    radius: RADIUS,
    rects: [...wallsFor(s, p), ...(s.tick % 90 < 45 ? stage.hazards : [])],
  };
  // Preserve Classic's authored respawn exactly unless it is now in danger or
  // solid geometry. Relocated fighters additionally avoid occupied positions.
  let position = safeSpawnPoint(preferred[0], preferred[1], rules) ? preferred : null;
  if (!position) {
    const candidates = Array.from({ length: 4 }, (_, offset) => spawns[(index + offset) % 4]).map(
      ([x, y]) => [clamp(x, rules.minX, rules.maxX), clamp(y, rules.minY, rules.maxY)],
    );
    position = findSafeSpawn({
      ...rules,
      candidates,
      circles: s.players
        .filter((other) => other !== p && !other.dead)
        .map((other) => ({ x: other.x, y: other.y, radius: 19 })),
    });
  }
  if (!position) {
    p.respawn = 1;
    return;
  }
  const [x, y] = position;
  Object.assign(p, {
    x,
    y,
    vx: 0,
    vy: 0,
    hp: p.maxHp,
    shield: 100,
    shielding: false,
    shieldLocked: false,
    shieldRelease: 0,
    dead: false,
    invuln: 30,
    dashCooldown: 0,
    dashTicks: 0,
    cooldowns: Array(5).fill(0),
    uses: Array(5).fill(0),
    fatigue: Array(5).fill(0),
  });
}
export function step(s, inputs = {}) {
  const { width: WIDTH, height: HEIGHT } = stateArena(s);
  if (s.engineBuild !== ENGINE_BUILD)
    throw Error(`Engine build mismatch: expected ${ENGINE_BUILD}, received ${s.engineBuild}`);
  if (s.ended) return s;
  // Commands precede every player and map update, including for later seats.
  for (const p of s.players) {
    const command = inputs[p.id];
    if (command?.forfeit === true)
      Object.assign(p, { hp: 0, dead: true, lives: 0, respawn: 0, shielding: false });
  }
  s.tick++;
  s.events = [];
  const stage = getMap(s.stage, 'classic', s.mapRevision);
  if (s.mode === 'lives' && s.shrinkAfter > 0 && s.tick > s.shrinkAfter * TICK_RATE)
    s.ring = Math.min(280, q((s.tick - s.shrinkAfter * TICK_RATE) * 0.12));
  const survival = survivalBounds(s);
  for (const p of s.players) {
    if (p.dead) {
      if (p.respawn > 0 && --p.respawn === 0) respawn(s, p);
      continue;
    }
    p.invuln = Math.max(0, p.invuln - 1);
    p.dashCooldown = Math.max(0, p.dashCooldown - 1);
    p.shieldRelease = Math.max(0, p.shieldRelease - 1);
    p.cooldowns = p.cooldowns.map((c) => Math.max(0, c - 1));
    if (s.tick % 90 === 0) p.fatigue = p.fatigue.map((f) => Math.max(0, f - 1));
    const input = inputs[p.id] || {},
      mx = clamp(finite(input.x), -1, 1),
      my = clamp(finite(input.y), -1, 1),
      [ux, uy] = mx || my ? unit(mx, my) : [0, 0];
    p.aimX = q(clamp(finite(input.aimX, p.aimX), 0, WIDTH));
    p.aimY = q(clamp(finite(input.aimY, p.aimY), 0, HEIGHT));
    const wasShielding = p.shielding;
    p.shielding = !!input.shield && !p.shieldLocked && p.shield > 0 && p.dashTicks === 0;
    if (wasShielding && !p.shielding) p.shieldRelease = 8;
    if (p.shielding) {
      p.shield = Math.max(0, q(p.shield - 2.5));
      if (p.shield === 0) {
        p.shieldLocked = true;
        p.shielding = false;
        p.shieldRelease = 8;
        s.events.push({ type: 'shieldbreak', x: p.x, y: p.y, playerId: p.id });
      }
    } else {
      p.shield = Math.min(100, q(p.shield + 3));
      if (p.shield === 100) p.shieldLocked = false;
    }
    if (input.dash && p.dashCooldown === 0 && !p.shielding && p.shieldRelease === 0) {
      const [dx, dy] = ux || uy ? [ux, uy] : unit(p.aimX - p.x, p.aimY - p.y);
      p.dashTicks = 5;
      p.dashCooldown = 45;
      p.vx = q(dx * 14);
      p.vy = q(dy * 14);
      p.invuln = Math.max(p.invuln, 5);
      s.events.push({ type: 'dash', x: p.x, y: p.y, playerId: p.id });
    }
    const boost = stage.pads.some((r) => inside(p.x, p.y, r)) ? 1.5 : 1,
      speed = p.shielding ? 1.2 : 4.5;
    movePlayer(
      s,
      p,
      (p.dashTicks ? 0 : ux * speed * boost) + p.vx,
      (p.dashTicks ? 0 : uy * speed * boost) + p.vy,
    );
    if (p.dashTicks > 0) p.dashTicks--;
    p.vx = q(p.vx * (p.dashTicks ? 0.94 : 0.72));
    p.vy = q(p.vy * (p.dashTicks ? 0.94 : 0.72));
    if (Number.isInteger(input.cast) && input.cast >= 0 && input.cast < p.loadout.length)
      cast(s, p, input.cast);
    if (!s.teamBattle && s.mode === 'hill' && square(p.x - 480) + square(p.y - 320) <= 75 * 75)
      p.score++;
    if (stage.hazards.some((r) => inside(p.x, p.y, r)) && s.tick % 90 < 45 && s.tick % 15 === 0)
      damage(s, p, 14, 0, 0, 0, null);
    if (
      s.ring &&
      (p.x < survival.minX || p.x > survival.maxX || p.y < survival.minY || p.y > survival.maxY) &&
      s.tick % 15 === 0
    )
      damage(s, p, 20, 0, 0, 0, p.lastHitTick > s.tick - 120 ? p.lastHit : null);
  }
  if (s.teamBattle) tickTeamHill(s);
  for (const e of s.entities) advanceEntity(s, e);
  s.entities = s.entities.filter((e) => e.ttl > 0);
  const alive = s.players.filter((p) => !p.dead || p.respawn > 0);
  if (s.teamBattle) {
    const outcome = teamOutcome(s);
    if (outcome.ended) Object.assign(s, outcome);
  } else if ((s.mode === 'lives' && alive.length <= 1) || s.tick >= s.timeLimit * TICK_RATE) {
    s.ended = true;
    if (s.mode === 'simulation') {
      const result = simulationComparison(s.players[0], s.players[1]);
      s.winner = result > 0 ? s.players[0].id : result < 0 ? s.players[1].id : null;
      return s;
    }
    let ranked = s.players
      .slice()
      .sort((a, b) =>
        s.mode === 'lives'
          ? b.lives - a.lives || b.hp - a.hp
          : b.score - a.score || b.kills - a.kills,
      );
    let top = ranked[0],
      second = ranked[1];
    s.winner =
      s.mode === 'lives'
        ? top.lives !== second.lives || top.hp !== second.hp
          ? top.id
          : null
        : top.score !== second.score || top.kills !== second.kills
          ? top.id
          : null;
  }
  return s;
}
export function botInput(s, id) {
  const p = s.players.find((p) => p.id === id);
  if (!p || p.dead) return {};
  const foes = s.players
    .filter((o) => o.id !== id && !o.dead && (!s.teamBattle || o.team !== p.team))
    .sort(
      (a, b) => square(a.x - p.x) + square(a.y - p.y) - (square(b.x - p.x) + square(b.y - p.y)),
    );
  const target = foes[0];
  if (!target) return {};
  const phase = (s.tick + hashString(id) + (s.seed % 180)) % 180,
    distance = hypot(target.x - p.x, target.y - p.y);
  const slots = p.loadout
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => p.cooldowns[i] === 0 && (m.limit !== 'charges' || p.uses[i] < m.charges));
  const slot = slots[(Math.floor(s.tick / 30) + p.spawnIndex) % Math.max(slots.length, 1)];
  const kind = slot?.m.kind || p.loadout[0].kind,
    desired = ['nova', 'orbit', 'wall'].includes(kind) ? 45 : kind === 'trap' ? 150 : 225;
  let [dx, dy] = unit(target.x - p.x, target.y - p.y),
    mx = dx * (distance > desired ? 1 : distance < desired - 35 ? -1 : 0),
    my = dy * (distance > desired ? 1 : distance < desired - 35 ? -1 : 0);
  if (distance > 70 && phase < 120) {
    const side = (Math.floor(phase / 60) % 2) * 2 - 1;
    mx += -dy * side * 0.6;
    my += dx * side * 0.6;
  }
  if (s.mode === 'hill' && distance > 130) {
    [mx, my] = unit(480 - p.x, 320 - p.y);
  }
  // Deterministic obstacle steering: try perpendicular passage if the planned step is blocked.
  const walls = wallsFor(s, p);
  if (walls.some((w) => overlap(p.x + mx * 25, p.y + my * 25, RADIUS, w))) {
    const side = p.spawnIndex % 2 ? 1 : -1;
    [mx, my] = [-dy * side, dx * side];
    if (walls.some((w) => overlap(p.x + mx * 25, p.y + my * 25, RADIUS, w))) [mx, my] = [-mx, -my];
  }
  const incoming = s.entities.some(
    (e) =>
      e.owner !== id &&
      (!s.teamBattle ||
        relationDamageScale(
          e.move,
          s.players.find((owner) => owner.id === e.owner),
          p,
          s,
        ) > 0) &&
      e.age > e.windup &&
      square(e.x - p.x) + square(e.y - p.y) < 85 * 85,
  );
  return survivalInput(
    s,
    p,
    {
      x: mx,
      y: my,
      aimX: q(target.x + target.vx * 2),
      aimY: q(target.y + target.vy * 2),
      dash: incoming && phase % 3 === 0,
      shield: incoming && phase % 3 !== 0 && p.shield > 25,
      cast: slot && distance < (kind === 'nova' ? 90 : kind === 'orbit' ? 100 : 550) ? slot.i : -1,
    },
    getMap(s.stage, 'classic', s.mapRevision || 1),
    walls,
  );
}
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** The state hash; see ../state-hash.js. */
export const stateHash = (state) => hashState(CLASSIC_STATE, state);
/** State fields that the hash neither covers nor names as left out. */
export const unlistedStateFields = (state) => unlistedFields(CLASSIC_STATE, state);
