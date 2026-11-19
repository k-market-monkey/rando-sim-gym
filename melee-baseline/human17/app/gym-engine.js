import { recordParries, defaultParryWindow } from './gym-parry.js';
import { BUILTIN_SHOOT } from '../shared/content/composed/fixtures.js';
import { clearCompilerCache } from '../shared/sim/composed/compiler.js';
import { advanceDuelOutcome } from '../shared/sim/composed/duel-outcome.js';
// Playable gym fork: circle swipe contact, parry counters and shield recovery rules.
// The Composed engine: matches whose moves are built from components (format 3).
import { getMechanicsVersion } from '../shared/protocol/versions.js';
import { simulationOptions, simulationComparison } from '../shared/sim/calibration-rules.js';
import { survivalBounds } from '../shared/sim/survival.js';
import { q, clamp, unit, inside, overlap } from '../shared/sim/composed/geometry.js';
import {
  normalizeHealthPercent,
  normalizeHandicapPercent,
  maxHealth,
} from '../shared/sim/health.js';
import {
  normalizeTeam,
  resolveAppearance,
  tickTeamHill,
  teamOutcome,
} from '../shared/sim/teams.js';
import { getMap } from '../shared/content/maps/catalog.js';
import { hasArenaPhysics } from '../shared/content/floor.js';
import {
  getStateMap,
  createMapState,
  surfaceMotion,
  chooseSpawn,
  advanceMap,
} from '../shared/sim/map-state.js';
import {
  resetSurfaceState,
  advanceSurfaceMovement,
  finishSurfaceMovement,
  moveOnFloor,
  MAX_FIGHTER_STEP,
} from '../shared/sim/arena-physics.js';
import { WIDTH, HEIGHT, arenaCenter, stateArena } from '../shared/content/arena.js';
import { COMPOSED_BASE_MOVES } from '../shared/content/composed/fixtures.js';
import { EMOTES, EMOTE_COOLDOWN } from '../shared/content/emotes.js';
import { compileMove } from '../shared/sim/composed/compiler.js';
import {
  resetResources,
  tickResources,
  processAttack,
  simulateEffects,
  sampleForces,
  damagePlayer,
  cancelAttack,
  clearOwned,
} from '../shared/sim/composed/runtime.js';
import {
  startItems,
  advanceItems,
  tickItemEffects,
  itemPace,
} from '../shared/sim/composed/items.js';
import { hypot, square } from '../shared/sim/exact-math.js';
import { hashState, unlistedFields } from '../shared/sim/state-hash.js';
import { COMPOSED_STATE } from '../shared/sim/composed/state-fields.js';
import { createCombatMoves } from '../shared/sim/composed/combat-identity.js';
import { resetSwipe, tickSwipe, processSwipe, resolveSwipe } from './gym-swipe.js';
import { resetShoot, tickShoot, processShoot } from '../shared/sim/composed/shoot.js';
import { resetShield, raiseShield, holdShield } from './gym-parry.js';
import {
  startFlags,
  advanceFlags,
  chooseFlagSpawn,
  flagOutcome,
} from '../shared/sim/composed/flags.js';
import { allWalls, circling } from '../shared/sim/composed/queries.js';
import { BOT_DIFFICULTIES } from '../shared/sim/composed/bot-skill.js';
export { circling } from '../shared/sim/composed/queries.js';
export { botInput } from '../shared/sim/composed/bot.js';
export { clearOwned };
const ENGINE_BUILD = getMechanicsVersion('composed').build;
export const TICK_RATE = 30,
  MAX_ENTITIES = 96;
const ENGINE = 'composed',
  FORMAT = 3;
const finite = (v, f = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
export function createMatch(options = {}) {
  if (options.mode === 'simulation') options = simulationOptions(options);
  const impulse = 2 * (options.knockbackMultiplier ?? 3);
  if (BUILTIN_SHOOT.templates[0].impulse !== impulse) {
    BUILTIN_SHOOT.templates[0].impulse = impulse;
    clearCompilerCache();
  }
  const players = options.players || [];
  if (players.length < 2 || players.length > 4) throw Error('Matches require 2–4 players');
  if (
    options.mode === 'ctf' &&
    players.some(
      (player) =>
        (player.team !== undefined || player.teamId !== undefined) &&
        !normalizeTeam(player.team ?? player.teamId),
    )
  )
    throw Error('Capture the flag requires valid occupied teams.');
  const map = getMap(options.stage || 'foundry', ENGINE, options.mapRevision),
    healthPercent = normalizeHealthPercent(options.healthPercent),
    teamBattle = !!options.teamBattle;
  if (map.supportedModes && !map.supportedModes.includes(options.mode || 'timed'))
    throw Error('This map does not support the selected mode.');
  if (options.mapRuleset && options.mapRuleset !== map.requiredRuleset)
    throw Error('This map does not support the selected surface ruleset.');
  const s = {
    formatVersion: FORMAT,
    engineBuild: ENGINE_BUILD,
    mechanicsVersion: ENGINE,
    healthPercent,
    teamBattle,
    swipeEnabled: options.swipeEnabled !== false,
    shootEnabled: options.shootEnabled !== false,
    botDifficulty: BOT_DIFFICULTIES.includes(options.botDifficulty)
      ? options.botDifficulty
      : 'normal',
    teamScores: {},
    flinchFrames: options.flinchFrames ?? 6,
    parryWindow: options.parryFrames ?? defaultParryWindow(),
    shieldReleaseFrames: options.shieldReleaseFrames ?? 8,
    shieldRearmFrames: options.shieldRearmFrames ?? 15,
    swipeCooldownFrames: options.swipeCooldownFrames ?? 14,
    knockbackMultiplier: options.knockbackMultiplier ?? 3,
    duelFirstDeathTick: null,
    duelFirstDeadIds: [],
    duelScore: null,
    duelEndReason: null,
    map: createMapState(map),
    stage: map.id,
    seed: (options.seed ?? 1) >>> 0,
    tick: 0,
    mode: ['simulation', 'timed', 'lives', 'hill', 'ctf'].includes(options.mode)
      ? options.mode
      : 'timed',
    timeLimit: clamp(finite(options.timeLimit, 120), 10, 600),
    shrinkAfter: clamp(finite(options.shrinkAfter, 60), 0, 600),
    ring: 0,
    ended: false,
    winner: null,
    winnerTeam: null,
    winners: [],
    nextEntityId: 1,
    nextReservationId: 1,
    entities: [],
    events: [],
    reservations: [],
    hitLedger: {},
    pendingImpacts: [],
    contentFaults: [],
    actionWork: {},
    telemetry: {
      activations: 0,
      hits: 0,
      damage: 0,
      detonations: 0,
      pairs: 0,
      forceTicks: 0,
      trailSegments: 0,
      destructions: 0,
      resourceBlocks: 0,
      invalidPlacements: 0,
      perMove: Object.create(null),
    },
    players: [],
  };
  if (options.roundNumber !== undefined) s.roundNumber = options.roundNumber;
  if (options.moveRefs !== undefined) s.moveRefs = structuredClone(options.moveRefs);
  if (options.survivalRevision === 2) s.survivalRevision = 2;
  if (options.selfDamageRulesRevision === 2) s.selfDamageRulesRevision = 2;
  // Advanced room rules are stored only when they differ from the default.
  if (teamBattle && options.friendlyFire === false) s.friendlyFire = false;
  const speedPercent = clamp(Math.round(finite(options.speedPercent, 100)), 60, 160);
  if (speedPercent !== 100) s.speedPercent = speedPercent;
  if (options.dashEnabled === false) s.dashEnabled = false;
  if (options.shieldEnabled === false) s.shieldEnabled = false;
  // A larger map names its size for the round message and the steps that bound it.
  if (map.width !== WIDTH || map.height !== HEIGHT)
    Object.assign(s, { arenaWidth: map.width, arenaHeight: map.height });
  const center = arenaCenter(map);
  s.players = players.map((original, i) => {
    const team = teamBattle
        ? normalizeTeam(original.team ?? original.teamId, i % 2 ? 'blue' : 'red')
        : null,
      p = teamBattle ? resolveAppearance(original, team) : original;
    const handicapPercent = normalizeHandicapPercent(p.handicapPercent),
      maxHp = maxHealth(healthPercent, handicapPercent),
      loadout = (p.loadout?.length ? p.loadout : COMPOSED_BASE_MOVES.slice(0, 3)).slice(0, 5);
    for (const m of loadout) {
      if (m.formatVersion !== FORMAT) throw Error('A match cannot mix mechanics formats');
      compileMove(m);
    }
    const fighter = {
      id: String(p.id),
      name: String(p.name || `Player ${i + 1}`),
      team,
      color: p.color || ['#78f0c5', '#f574a5', '#ffce5c', '#76bcff'][i],
      secondaryColor: p.secondaryColor || '#f574a5',
      look: p.look || 'round',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fieldX: 0,
      fieldY: 0,
      hp: maxHp,
      maxHp,
      handicapPercent,
      flinchTicks: 0,
      lastParryTick: null,
      lastParryLife: null,
      hardProtection: 0,
      impactRecovery: 0,
      invuln: 0,
      dashCooldown: 0,
      dashTicks: 0,
      score: 0,
      kills: 0,
      deaths: 0,
      lives: clamp(Math.trunc(finite(options.lives, 3)), 1, 10),
      dead: false,
      respawn: 0,
      life: 1,
      loadout,
      aimX: center.x,
      aimY: center.y,
      spawnIndex: i,
      lastHit: null,
      lastHitTick: -9999,
    };
    resetResources(fighter);
    resetShield(fighter);
    resetSwipe(fighter);
    resetShoot(fighter);
    if (team) s.teamScores[team] = 0;
    return fighter;
  });
  s.combatMoves = createCombatMoves(s.players);
  startFlags(s);
  for (const p of s.players) {
    const pos = s.mode === 'ctf' ? chooseFlagSpawn(s, p) : chooseSpawn(s, p.spawnIndex, 0);
    if (!pos) throw Error('No valid map spawn');
    [p.x, p.y] = pos;
    if (hasArenaPhysics(map)) resetSurfaceState(p);
  }
  if (options.mechanicsVersion) s.mapRevision = map.revision;
  startItems(s, options.itemDrops);
  return s;
}
function movePlayer(s, p, dx, dy) {
  const ws = allWalls(s),
    { width, height } = stateArena(s);
  p.x = q(clamp(p.x + dx, 33, width - 33));
  for (const w of ws) if (overlap(p.x, p.y, 13, w)) p.x = q(dx >= 0 ? w.x - 13 : w.x + w.w + 13);
  p.y = q(clamp(p.y + dy, 33, height - 33));
  for (const w of ws) if (overlap(p.x, p.y, 13, w)) p.y = q(dy >= 0 ? w.y - 13 : w.y + w.h + 13);
  p.x = clamp(p.x, 33, width - 33);
  p.y = clamp(p.y, 33, height - 33);
}
function respawn(s, p) {
  const position =
    s.mode === 'ctf' ? chooseFlagSpawn(s, p) : chooseSpawn(s, p.spawnIndex, p.deaths);
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
    fieldX: 0,
    fieldY: 0,
    hp: p.maxHp,
    dead: false,
    hardProtection: 30,
    impactRecovery: 0,
    invuln: 30,
    dashCooldown: 0,
    dashTicks: 0,
    life: p.life + 1,
  });
  if (s.items) Object.assign(p, { itemShield: 0, itemSpeed: 0 });
  if (hasArenaPhysics(getStateMap(s))) resetSurfaceState(p);
  resetResources(p);
  resetShield(p);
  resetSwipe(p);
  resetShoot(p);
}
/** Fixed order: map boundary, resources/input, fields/movement, casts, object events, hits, outcomes. */
export function step(s, inputs = {}) {
  if (s.engineBuild !== ENGINE_BUILD)
    throw Error(`Engine build mismatch: expected ${ENGINE_BUILD}, received ${s.engineBuild}`);
  if (s.ended) return s;
  if (s.formatVersion !== FORMAT) throw Error('Composed engine requires format ' + FORMAT);
  inputs = { ...inputs };
  for (const p of s.players)
    if (p.flinchTicks > 0 && !p.dead) {
      cancelAttack(s, p);
      p.shootQueued = 0;
      inputs[p.id] = {
        ...inputs[p.id],
        x: 0,
        y: 0,
        cast: -1,
        pressedSlots: [],
        heldSlots: [],
        shoot: false,
        swipe: false,
        cancelAttack: true,
      };
      p.flinchTicks--;
    }
  // Commands precede every player and map update, including for later seats.
  for (const p of s.players) {
    const command = inputs[p.id];
    if (command?.cancelAttack === true) {
      p.swipeAttack = null;
      p.pendingAttack = null;
      p.heldAttackOrder = [];
    }
    if (
      command?.cancelAttack === true &&
      (p.channel != null || (p.attack && p.loadout[p.attack.slot]?.activation.mode === 'hold'))
    )
      cancelAttack(s, p);
    if (command?.forfeit === true)
      Object.assign(p, { hp: 0, dead: true, lives: 0, respawn: 0, shielding: false });
  }
  s.tick++;
  s.events = [];
  advanceMap(s);
  const map = getStateMap(s);
  if (s.mode === 'lives' && s.shrinkAfter > 0 && s.tick > s.shrinkAfter * 30)
    s.ring = Math.min(280, q((s.tick - s.shrinkAfter * 30) * 0.12));
  const survival = survivalBounds(s),
    pace = (s.speedPercent ?? 100) / 100,
    arena = stateArena(s),
    center = arenaCenter(arena);
  for (const p of s.players) {
    if (p.dead) {
      clearOwned(s, p);
      if (p.respawn > 0 && --p.respawn === 0) respawn(s, p);
      continue;
    }
    p.hardProtection = Math.max(0, p.hardProtection - 1);
    p.impactRecovery = Math.max(0, p.impactRecovery - 1);
    p.invuln = p.hardProtection;
    p.dashCooldown = Math.max(0, p.dashCooldown - 1);
    p.shieldRelease = Math.max(0, p.shieldRelease - 1);
    tickItemEffects(p);
    tickResources(s, p);
    tickSwipe(p);
    tickShoot(p);
    const input = inputs[p.id] || {},
      mx = clamp(finite(input.x), -1, 1),
      my = clamp(finite(input.y), -1, 1),
      [ux, uy] = mx || my ? unit(mx, my) : [0, 0];
    if (
      Number.isInteger(input.emote) &&
      input.emote >= 1 &&
      input.emote <= EMOTES.length &&
      !(s.tick - p.emoteTick < EMOTE_COOLDOWN)
    ) {
      p.emoteTick = s.tick;
      s.events.push({ type: 'emote', emote: input.emote, x: p.x, y: p.y, playerId: p.id });
    }
    p.aimX = q(clamp(finite(input.aimX, p.aimX), 0, arena.width));
    p.aimY = q(clamp(finite(input.aimY, p.aimY), 0, arena.height));
    if (raiseShield(s, p, input)) cancelAttack(s, p);
    holdShield(s, p);
    if (
      input.dash &&
      s.dashEnabled !== false &&
      p.dashCooldown === 0 &&
      !p.shielding &&
      p.shieldRelease === 0 &&
      !circling(s, p.id)
    ) {
      cancelAttack(s, p);
      const [dx, dy] = ux || uy ? [ux, uy] : unit(p.aimX - p.x, p.aimY - p.y);
      p.dashTicks = 5;
      p.dashCooldown = 45;
      p.vx = q(dx * 14 * pace);
      p.vy = q(dy * 14 * pace);
      p.fieldX = 0;
      p.fieldY = 0;
      p.hardProtection = Math.max(p.hardProtection, 5);
      s.events.push({ type: 'dash', x: p.x, y: p.y, playerId: p.id });
    }
    const [fx, fy] = sampleForces(s, p);
    p.fieldX = q(p.fieldX * 0.6 + fx);
    p.fieldY = q(p.fieldY * 0.6 + fy);
    const forceLength = hypot(p.fieldX, p.fieldY);
    if (forceLength > 2.5) {
      p.fieldX = q((p.fieldX * 2.5) / forceLength);
      p.fieldY = q((p.fieldY * 2.5) / forceLength);
    }
    const surface = surfaceMotion(s, p),
      boost = map.pads.some((r) => inside(p.x, p.y, r)) ? 1.5 : 1,
      walk = pace * itemPace(p),
      speed = (p.shielding ? 1.2 : 4.5) * walk * surface.walkScale;
    const authored = hasArenaPhysics(map),
      wasDashing = p.dashTicks > 0;
    let collision;
    if (authored) {
      const motion = advanceSurfaceMovement(map, p, ux, uy, speed * boost);
      collision = moveOnFloor(
        map,
        allWalls(s),
        p,
        motion.x,
        motion.y,
        MAX_FIGHTER_STEP * Math.max(1, walk),
      );
    } else
      movePlayer(
        s,
        p,
        (p.dashTicks ? 0 : ux * speed * boost + p.fieldX + surface.x) + p.vx,
        (p.dashTicks ? 0 : uy * speed * boost + p.fieldY + surface.y) + p.vy,
      );
    // Input commitment sees the dash before its final tick is decremented.
    const generatedCommitted = processAttack(s, p, input);
    processSwipe(
      s,
      p,
      generatedCommitted === 'swipe' ? { ...input, swipe: true } : input,
      generatedCommitted === true,
    );
    processShoot(s, p, input);
    if (p.dashTicks > 0) p.dashTicks--;
    if (authored) finishSurfaceMovement(map, p, wasDashing, collision);
    else {
      p.vx = q(p.vx * (p.dashTicks ? 0.94 : 0.72));
      p.vy = q(p.vy * (p.dashTicks ? 0.94 : 0.72));
    }
    if (
      !s.teamBattle &&
      s.mode === 'hill' &&
      square(p.x - center.x) + square(p.y - center.y) <= 75 * 75
    )
      p.score++;
    if (map.hazards.some((r) => inside(p.x, p.y, r)) && s.tick % 90 < 45 && s.tick % 15 === 0)
      damagePlayer(s, p, 14);
    if (
      s.ring &&
      (p.x < survival.minX || p.x > survival.maxX || p.y < survival.minY || p.y > survival.maxY) &&
      s.tick % 15 === 0
    )
      damagePlayer(s, p, 20, 0, 0, 0, p.lastHitTick > s.tick - 120 ? p.lastHit : null);
  }
  advanceItems(s);
  simulateEffects(s);
  resolveSwipe(s);
  advanceFlags(s);
  tickTeamHill(s);
  recordParries(s);
  for (const e of s.events)
    if (e.type === 'hit' && e.damage > 0 && e.owner !== e.playerId) {
      const p = s.players.find((p) => p.id === e.playerId);
      if (p && !p.dead) {
        p.flinchTicks = s.flinchFrames;
        if (p.flinchTicks) {
          cancelAttack(s, p);
          p.shootQueued = 0;
        }
      }
    }
  if (s.mode === 'simulation') advanceDuelOutcome(s);
  else if (s.teamBattle) {
    const result = s.mode === 'ctf' ? flagOutcome(s) : teamOutcome(s);
    if (result.ended) {
      s.ended = true;
      s.winnerTeam = result.winnerTeam;
      s.winners = result.winners;
      s.winner = result.winners[0] || null;
    }
  } else {
    const alive = s.players.filter((p) => !p.dead || p.respawn > 0);
    if ((s.mode === 'lives' && alive.length <= 1) || s.tick >= s.timeLimit * 30) {
      s.ended = true;
      const compare =
          s.mode === 'simulation'
            ? (a, b) => simulationComparison(b, a)
            : s.mode === 'lives'
              ? (a, b) => b.lives - a.lives || b.hp - a.hp
              : (a, b) => b.score - a.score || b.kills - a.kills,
        ranked = s.players.slice().sort(compare);
      s.winner =
        ranked[0] && (!ranked[1] || compare(ranked[0], ranked[1]) !== 0) ? ranked[0].id : null;
      s.winners = s.winner ? [s.winner] : [];
    }
  }
  return s;
}
/** The state hash; see ../state-hash.js. */
export const stateHash = (state) => hashState(COMPOSED_STATE, state);
/** State fields that the hash neither covers nor names as left out. */
export const unlistedStateFields = (state) => unlistedFields(COMPOSED_STATE, state);
