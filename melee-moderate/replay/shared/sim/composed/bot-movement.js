// Hard-bot combat positioning. Runs after the shared policy picks a target and an
// attack, and before threat avoidance, which may still override the direction.
// Objectives (flags, hill, health, paired setup, self-risk) keep their own movement.
import { getStateMap } from '../map-state.js';
import { allWalls } from './queries.js';
import { botMemory, syncLife } from './bot-memory.js';
import { firingPosition, needsDirectLine, sightBlocked, steerToward } from './bot-navigation.js';
import { noteIntent, recoverStall, resetStall } from './bot-recovery.js';
import { strafeInput } from './bot-strafe.js';
import { movementStance } from './bot-style.js';
import { hypot } from '../exact-math.js';

/** Strafing starts inside this margin beyond the preferred distance; farther out the policy's route approaches. */
const STRAFE_BAND = 30;

/** Three walking ticks. */
const LOOKAHEAD = 14;

/**
 * `context` comes from the shared policy: the target, chosen move and plan, and
 * whether this tick's movement is ordinary combat positioning. `style` is an
 * experimental movement style; see `movementStance`.
 */
export function hardMovement(state, player, input, context, style = 'balanced') {
  const memory = botMemory(state, player.id);
  syncLife(memory, player);
  if (!context.target || context.target.dead) {
    memory.firing = null;
    resetStall(memory);
    return input;
  }
  return recoverStall(
    state,
    player,
    position(state, player, input, context, memory, style),
    memory,
  );
}

/** Records the tick's final input for stall detection. */
export function noteHardInput(state, player, input) {
  noteIntent(state, player, input, botMemory(state, player.id));
}

function position(state, player, input, context, memory, style) {
  const { target, move, plan } = context;
  if (!context.combat || !move || !needsDirectLine(move)) {
    memory.firing = null;
    return input;
  }
  const stance = movementStance(style, plan.affordances),
    map = getStateMap(state),
    walls = allWalls(state);
  if (sightBlocked(walls, player, target)) {
    const goal = firingPosition({
      state,
      map,
      walls,
      player,
      target,
      preferred: stance.desired,
      reach: Math.max(plan.affordances.range + 13, plan.affordances.preferredDistance + 40),
      memory,
    });
    if (!goal) return input;
    const [x, y] = steerToward(map, walls, player, goal);
    return { ...input, x, y };
  }
  memory.firing = null;
  const strafe = () => {
    const [x, y] = strafeInput({
      state,
      map,
      walls,
      player,
      target,
      stance,
      memory,
      needsLine: true,
    });
    return { ...input, x, y };
  };
  // Channels keep the policy's movement so sweeping attacks behave as before.
  if (
    player.channel == null &&
    hypot(target.x - player.x, target.y - player.y) <=
      Math.max(plan.affordances.preferredDistance, stance.desired) + STRAFE_BAND
  )
    return strafe();
  // Keep an open shot: do not walk back behind the wall that just stopped blocking it.
  // Outside a channel, take a strafing step that keeps the line instead of waiting
  // for the policy's route to stop pointing behind the wall.
  const ahead = {
    x: player.x + (input.x || 0) * LOOKAHEAD,
    y: player.y + (input.y || 0) * LOOKAHEAD,
  };
  if (!sightBlocked(walls, ahead, target)) return input;
  return player.channel == null ? strafe() : { ...input, x: 0, y: 0 };
}
