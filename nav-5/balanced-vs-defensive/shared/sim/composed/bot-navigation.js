// Hard-bot navigation queries: line of sight, firing positions and routed steering.
// Bounded: at most 32 candidate points per replan, reusing the floor router's cached
// search trees, and at most five corridor checks per steering call.
import { legalFighterPosition, routeOnFloor } from '../arena-physics.js';
import { blockedSegment, dir, q, unit } from './geometry.js';
import { hypot, square } from '../exact-math.js';

/** Fighter radius 13 plus a margin so goals and corridors do not scrape wall corners. */
export const CLEARANCE = 16;
/** Ticks a chosen firing position is kept while it stays usable. */
export const REPLAN_TICKS = 12;
/** A shot counts as blocked within this margin of a wall. */
const SHOT_PAD = 4;
/** Firing positions keep a wider margin so small drift does not close the shot. */
const CLEAR_PAD = 14;

/** Paired setups and lobs act without a straight line; everything else needs one. */
export function needsDirectLine(move) {
  if (move.setup?.kind === 'pair') return false;
  return move.templates.find((t) => t.id === move.root)?.motion.kind !== 'lob';
}

export const sightBlocked = (walls, from, to, pad = SHOT_PAD) =>
  blockedSegment(from.x, from.y, to.x, to.y, walls, pad);

/** The router works on 40-unit cells; other arena sizes fall back to direct steering. */
const routable = (map) => map.width % 40 === 0 && map.height % 40 === 0;

export function clearCorridor(map, walls, from, to) {
  const distance = hypot(to.x - from.x, to.y - from.y),
    steps = Math.max(1, Math.ceil(distance / 8));
  for (let i = 1; i <= steps; i++)
    if (
      !legalFighterPosition(
        map,
        walls,
        from.x + ((to.x - from.x) * i) / steps,
        from.y + ((to.y - from.y) * i) / steps,
        13.5,
      )
    )
      return false;
  return true;
}

/** Route length from the player to a goal, or null when the lattice cannot reach it. */
function routeLength(map, walls, player, goal) {
  if (!routable(map)) return hypot(goal.x - player.x, goal.y - player.y);
  const path = routeOnFloor(map, walls, player, goal);
  if (!path.length) return null;
  const last = path[path.length - 1];
  if (square(last[0] - goal.x) + square(last[1] - goal.y) > 40 * 40) return null;
  return (
    hypot(path[0][0] - player.x, path[0][1] - player.y) +
    (path.length - 1) * 40 +
    hypot(goal.x - last[0], goal.y - last[1])
  );
}

/**
 * A reachable point with a clear shot at the target, near the preferred distance.
 * The previous choice wins near-ties so equally good routes do not alternate.
 */
export function firingPosition({ state, map, walls, player, target, preferred, reach, memory }) {
  const tick = state.tick,
    kept = memory.firing,
    usable = (x, y) =>
      legalFighterPosition(map, walls, x, y, CLEARANCE) &&
      square(x - target.x) + square(y - target.y) <= square(reach) &&
      !sightBlocked(walls, { x, y }, target, CLEAR_PAD),
    failed = (x, y) =>
      memory.failed.some((f) => f.until > tick && square(f.x - x) + square(f.y - y) < square(40));
  if (kept && tick - kept.tick < REPLAN_TICKS && usable(kept.x, kept.y)) return kept;
  const near = Math.min(preferred, reach - 10),
    radii = [near, Math.max(60, Math.round(near * 0.6))];
  let best = null;
  for (const [ring, radius] of radii.entries())
    for (let k = 0; k < 16; k++) {
      const [ux, uy] = dir(k * 2),
        x = q(target.x + ux * radius),
        y = q(target.y + uy * radius);
      if (!usable(x, y) || failed(x, y)) continue;
      const length = routeLength(map, walls, player, { x, y });
      if (length === null) continue;
      let cost = length + ring * 40;
      if (kept && square(kept.x - x) + square(kept.y - y) < square(40)) cost -= 60;
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  memory.firing = best ? { x: best.x, y: best.y, tick } : null;
  return memory.firing;
}

/** A unit steering vector along the floor route, cutting corners only through clear corridors. */
export function steerToward(map, walls, player, goal) {
  if (square(goal.x - player.x) + square(goal.y - player.y) < 8 * 8) return [0, 0];
  let point = { x: goal.x, y: goal.y };
  if (routable(map) && !clearCorridor(map, walls, player, point)) {
    const path = routeOnFloor(map, walls, player, goal);
    if (path.length) {
      const first = hypot(path[0][0] - player.x, path[0][1] - player.y) > 24 ? 0 : 1,
        next = path[Math.min(first, path.length - 1)];
      point = { x: next[0], y: next[1] };
      for (let i = Math.min(path.length - 1, 4); i > 0; i--)
        if (clearCorridor(map, walls, player, { x: path[i][0], y: path[i][1] })) {
          point = { x: path[i][0], y: path[i][1] };
          break;
        }
    }
  }
  const brake = map.physics ? 4 : 0;
  return unit(
    point.x - player.x - (player.walkMomentumX || 0) * brake,
    point.y - player.y - (player.walkMomentumY || 0) * brake,
  );
}
