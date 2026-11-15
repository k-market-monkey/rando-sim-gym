// Hard-bot stall detection and recovery. A bot that keeps steering without getting
// anywhere (pushing a wall, jittering in place) first abandons its current firing
// goal, then detours sideways, and after repeated failures waits briefly instead of
// repeating the same recovery. Gameplay movement limits never count as a stall.
import { legalFighterPosition } from '../arena-physics.js';
import { getStateMap } from '../map-state.js';
import { allWalls } from './queries.js';
import { square } from '../exact-math.js';
import { unit } from './geometry.js';

/** Steering for this many ticks without leaving the anchor is a stall. */
export const STALL_TICKS = 24;
/** Moving this far from the anchor counts as progress. */
export const PROGRESS = 18;
const DETOUR_TICKS = 18,
  FAILED_GOAL_TICKS = 150,
  MAX_RECOVERIES = 3,
  HOLD_TICKS = 45,
  // Recoveries count toward a hold until the bot goes this long without stalling.
  RECOVERY_MEMORY = 150;

const steering = (input) => Math.abs(input?.x || 0) + Math.abs(input?.y || 0) >= 0.5;
// Dash, shield walking, a lunge or knockback move the fighter regardless of steering.
const restricted = (p) =>
  p.dashTicks > 0 ||
  p.shielding ||
  (p.attack && p.attack.lungeX != null) ||
  Math.abs(p.vx) + Math.abs(p.vy) > 1;

function fresh(player) {
  return { anchorX: player.x, anchorY: player.y, steerTicks: 0, recoveries: 0 };
}

/**
 * Called once with each tick's final input. Advances the stall window only when the
 * tick changes, so repeated queries in one tick see the same decision.
 */
export function noteIntent(state, player, input, memory) {
  if (memory.intentTick === state.tick) return;
  memory.intentTick = state.tick;
  memory.intent = steering(input) ? [input.x, input.y] : null;
}

function track(state, player, memory) {
  const stall = (memory.stall ||= fresh(player)),
    goal = memory.firing ? `${memory.firing.x},${memory.firing.y}` : '';
  if (stall.tick === state.tick) return stall;
  stall.tick = state.tick;
  const moved =
    square(player.x - stall.anchorX) + square(player.y - stall.anchorY) >= square(PROGRESS);
  // The previous tick's intent produced this tick's position.
  if (moved || !memory.intent || restricted(player) || goal !== stall.goal)
    Object.assign(stall, { anchorX: player.x, anchorY: player.y, steerTicks: 0, goal });
  else stall.steerTicks++;
  if (state.tick - (stall.lastRecovery ?? -RECOVERY_MEMORY) > RECOVERY_MEMORY) stall.recoveries = 0;
  return stall;
}

/** Forget the stall window, e.g. after a death or when the bot has nothing to fight. */
export function resetStall(memory) {
  memory.stall = null;
  memory.intent = null;
}

/** Returns the input, replaced by a recovery movement while one is active. */
export function recoverStall(state, player, input, memory) {
  const stall = track(state, player, memory),
    tick = state.tick;
  if (stall.holdUntil > tick) return { ...input, x: 0, y: 0 };
  if (stall.detourUntil > tick) return { ...input, x: stall.detourX, y: stall.detourY };
  stall.detourUntil = 0;
  if (stall.steerTicks < STALL_TICKS) return input;
  stall.steerTicks = 0;
  stall.anchorX = player.x;
  stall.anchorY = player.y;
  stall.lastRecovery = tick;
  if (++stall.recoveries > MAX_RECOVERIES) {
    stall.recoveries = 0;
    stall.holdUntil = tick + HOLD_TICKS;
    return { ...input, x: 0, y: 0 };
  }
  if (memory.firing) {
    // The chosen firing position is unreachable from here; pick another.
    memory.failed = memory.failed.filter((f) => f.until > tick);
    memory.failed.push({ x: memory.firing.x, y: memory.firing.y, until: tick + FAILED_GOAL_TICKS });
    memory.firing = null;
    return input;
  }
  // Sidestep across the stuck heading, alternating sides on repeated stalls.
  const [hx, hy] = memory.intent || [input.x || 0, input.y || 0],
    [ux, uy] = unit(hx, hy),
    side = stall.recoveries % 2 ? 1 : -1,
    map = getStateMap(state),
    walls = allWalls(state),
    // Adding 0 turns -0 into 0 so inputs compare and serialize plainly.
    options = [
      [-uy * side + 0, ux * side + 0],
      [uy * side + 0, -ux * side + 0],
      [-ux + 0, -uy + 0],
    ],
    [x, y] =
      options.find(([dx, dy]) =>
        legalFighterPosition(map, walls, player.x + dx * 30, player.y + dy * 30),
      ) || options[2];
  Object.assign(stall, { detourX: x, detourY: y, detourUntil: tick + DETOUR_TICKS });
  return { ...input, x, y };
}
