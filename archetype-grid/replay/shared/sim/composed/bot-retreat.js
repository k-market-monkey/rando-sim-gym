// Hard-bot retreat direction. Instead of backing straight away from the target into
// a wall, the arena edge or the closing survival ring, the bot scores sixteen
// directions by the open floor in front of them. Open retreats win; a blocked one
// turns lateral; a cornered bot slides out past the target's side. Only the walking
// direction changes, so attacks, Dash and Shield stay with the shared policy.
import { legalFighterPosition } from '../arena-physics.js';
import { survivalBounds } from '../survival.js';
import { dir, unit } from './geometry.js';
import { sightBlocked } from './bot-navigation.js';

/** Open floor is measured this far along each direction, in steps of `STEP`. */
export const REACH = 90;
const STEP = 15,
  // Less open floor than this straight back means the bot is cornered.
  CORNERED = 40,
  // A new direction must beat the previous one by this much to replace it.
  KEEP = 12;

/** Steps the bot may stand on: legal floor, inside the survival ring if one closes. */
function standable(state, map, walls) {
  const ring =
    state.mode === 'lives' && state.ring
      ? survivalBounds({ ...state, ring: state.ring + 4 }, 13, map)
      : null;
  return (x, y) =>
    legalFighterPosition(map, walls, x, y) &&
    (!ring || (x >= ring.minX && x <= ring.maxX && y >= ring.minY && y <= ring.maxY));
}

/** Open floor along a direction, up to `REACH`. */
function room(ok, player, x, y) {
  let distance = 0;
  while (distance < REACH && ok(player.x + x * (distance + STEP), player.y + y * (distance + STEP)))
    distance += STEP;
  return distance;
}

/**
 * A walking direction away from the target. `side` (-1, 0 or 1) is the current
 * strafing side, which breaks ties so retreats keep circling the same way. Null when
 * no direction is open, leaving the caller's strafing candidates.
 */
export function retreatDirection({ state, map, walls, player, target, memory, side, needsLine }) {
  const ok = standable(state, map, walls),
    [ax, ay] = unit(player.x - target.x, player.y - target.y),
    directions = [];
  for (let i = 0; i < 32; i += 2) {
    const [x, y] = dir(i);
    directions.push({ x, y, away: x * ax + y * ay, lateral: (ay * x - ax * y) * side });
  }
  const straight = directions.reduce((best, d) => (d.away > best.away ? d : best)),
    cornered = room(ok, player, straight.x, straight.y) < CORNERED,
    previous = memory.retreat;
  let best = null;
  for (const d of directions) {
    // Retreats stay on the far side of the target; a cornered bot may slide past it.
    if (d.away < (cornered ? -0.5 : 0)) continue;
    const open = room(ok, player, d.x, d.y);
    if (open < STEP) continue;
    // Like strafing, a retreat never walks an open shot back behind a wall; the
    // blocked-shot search would only send the bot straight back.
    if (
      needsLine &&
      sightBlocked(walls, { x: player.x + d.x * STEP, y: player.y + d.y * STEP }, target)
    )
      continue;
    const score =
      open +
      d.away * (cornered ? 10 : 40) +
      d.lateral * 8 +
      (previous && d.x * previous.x + d.y * previous.y > 0.9 ? KEEP : 0);
    if (!best || score > best.score) best = { ...d, score };
  }
  memory.retreat = best && { x: best.x, y: best.y };
  return best ? [best.x, best.y] : null;
}
