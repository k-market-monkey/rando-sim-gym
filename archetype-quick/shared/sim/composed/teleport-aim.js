// Both bot policies choose a legal point beside the goal, never an occupied enemy center.
import { arenaCenter, stateArena } from '../../content/arena.js';
import { unit } from './geometry.js';
import { flagDestination } from './flags.js';
import { teleportDestination } from './mechanics.js';

export function teleportAim(state, player, move, target) {
  const goal =
      flagDestination(state, player) ||
      (state.mode === 'hill' ? arenaCenter(stateArena(state)) : target),
    [dx, dy] = unit(goal.x - player.x, goal.y - player.y),
    side = player.spawnIndex % 2 ? 1 : -1;
  for (const offset of [60, 100, 140]) {
    const x = goal.x - dx * offset - dy * side * 40,
      y = goal.y - dy * offset + dx * side * 40;
    if (teleportDestination(state, player, move, x, y)) return { x, y };
  }
  return null;
}
