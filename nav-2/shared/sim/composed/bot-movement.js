// Hard-bot combat positioning. Runs after the shared policy picks a target and an
// attack, and before threat avoidance, which may still override the direction.
// Objectives (flags, hill, health, paired setup, self-risk) keep their own movement.
import { getStateMap } from '../map-state.js';
import { allWalls } from './queries.js';
import { botMemory, syncLife } from './bot-memory.js';
import { firingPosition, needsDirectLine, sightBlocked, steerToward } from './bot-navigation.js';
import { noteIntent, recoverStall, resetStall } from './bot-recovery.js';

/** Three walking ticks. */
const LOOKAHEAD = 14;

/**
 * `context` comes from the shared policy: the target, chosen move and plan, and
 * whether this tick's movement is ordinary combat positioning.
 */
export function hardMovement(state, player, input, context) {
  const memory = botMemory(state, player.id);
  syncLife(memory, player);
  if (!context.target || context.target.dead) {
    memory.firing = null;
    resetStall(memory);
    return input;
  }
  return recoverStall(state, player, position(state, player, input, context, memory), memory);
}

/** Records the tick's final input for stall detection. */
export function noteHardInput(state, player, input) {
  noteIntent(state, player, input, botMemory(state, player.id));
}

function position(state, player, input, context, memory) {
  const { target, move, plan } = context;
  if (!context.combat || !move || !needsDirectLine(move)) {
    memory.firing = null;
    return input;
  }
  const map = getStateMap(state),
    walls = allWalls(state);
  if (sightBlocked(walls, player, target)) {
    const goal = firingPosition({
      state,
      map,
      walls,
      player,
      target,
      preferred: plan.affordances.preferredDistance,
      reach: Math.max(plan.affordances.range + 13, plan.affordances.preferredDistance + 40),
      memory,
    });
    if (!goal) return input;
    const [x, y] = steerToward(map, walls, player, goal);
    return { ...input, x, y };
  }
  memory.firing = null;
  // Keep an open shot: do not walk back behind the wall that just stopped blocking it.
  const ahead = {
    x: player.x + (input.x || 0) * LOOKAHEAD,
    y: player.y + (input.y || 0) * LOOKAHEAD,
  };
  return sightBlocked(walls, ahead, target) ? { ...input, x: 0, y: 0 } : input;
}
