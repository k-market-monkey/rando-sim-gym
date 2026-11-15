// Hard-bot strafing: approach or retreat by the preferred-distance band, plus a
// sideways component held for seeded segments. Segment lengths and sides come from
// the match seed, the bot id and the segment number, so bots do not share a rhythm
// and replays repeat exactly. Perception and reaction speed are unchanged.
import { hypot } from '../exact-math.js';
import { unit } from './geometry.js';
import { clearCorridor, sightBlocked } from './bot-navigation.js';
import { retreatDirection } from './bot-retreat.js';

/** Segment length bounds in ticks. */
export const SEGMENT_MIN = 24;
export const SEGMENT_SPREAD = 43;
/** Radial dead band in units. */
const HYSTERESIS = 10;
/** Minimum ticks on a side after turning away from a wall, edge or lost shot. */
const TURN_TICKS = 12;
/** Three walking ticks ahead must be open floor, with the shot still open. */
const LOOKAHEAD = 14;

function mix(...values) {
  let h = 2166136261;
  for (const value of values) {
    h = Math.imul(h ^ (value >>> 0), 16777619);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
function idHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
  return h >>> 0;
}

/** The current lateral segment, advanced when it expires: side -1, 0 (hold) or 1. */
export function strafeSegment(state, player, memory) {
  const current = memory.strafe;
  if (current && current.until > state.tick) return current;
  const n = (current?.n ?? -1) + 1,
    h = mix(state.seed, idHash(player.id), n),
    // One segment in five holds the lateral position; otherwise usually switch sides.
    side = h % 5 === 0 ? 0 : current?.side && h % 7 !== 0 ? -current.side : (h >>> 8) % 2 ? 1 : -1;
  memory.strafe = { n, side, until: state.tick + SEGMENT_MIN + ((h >>> 12) % SEGMENT_SPREAD) };
  return memory.strafe;
}

/**
 * Approach beyond the preferred distance and retreat inside the band's near edge, as
 * the shared policy does, but keep going until well inside the band so the distance
 * hovering at a threshold does not flip the direction every tick.
 */
function radialIntent(memory, distance, desired) {
  const previous = memory.radial || 0,
    radial =
      distance > desired || (previous === 1 && distance > desired - HYSTERESIS)
        ? 1
        : distance < desired - 25 || (previous === -1 && distance < desired - 25 + HYSTERESIS)
          ? -1
          : 0;
  memory.radial = radial;
  return radial;
}

/**
 * A steering vector around the target, or [0, 0] to hold. `needsLine` keeps steps that
 * would close an open shot out of the candidates.
 */
export function strafeInput({ state, map, walls, player, target, plan, memory, needsLine }) {
  const [dx, dy] = unit(target.x - player.x, target.y - player.y),
    desired = plan.affordances.preferredDistance,
    distance = hypot(target.x - player.x, target.y - player.y),
    radial = radialIntent(memory, distance, desired),
    segment = strafeSegment(state, player, memory),
    // Closing or opening distance comes first; sideways motion is reduced meanwhile.
    weight = radial ? 0.6 : 1,
    open = (x, y) => {
      if (!x && !y) return true;
      const ahead = { x: player.x + x * LOOKAHEAD, y: player.y + y * LOOKAHEAD };
      return (
        clearCorridor(map, walls, player, ahead) &&
        (!needsLine || !sightBlocked(walls, ahead, target))
      );
    },
    candidate = (side) =>
      radial || side
        ? unit(dx * radial - dy * side * weight, dy * radial + dx * side * weight)
        : [0, 0];
  if (radial === -1) {
    // Back away toward open floor rather than straight into a wall or edge.
    const away = retreatDirection({
      state,
      map,
      walls,
      player,
      target,
      memory,
      side: segment.side,
      needsLine,
    });
    if (away) return away;
  } else memory.retreat = null;
  for (const side of segment.side ? [segment.side, -segment.side] : [0]) {
    const move = candidate(side);
    if (open(move[0], move[1])) {
      // A forced turn keeps the new side for a while, so the next segment cannot
      // send the bot straight back into the obstacle.
      if (side !== segment.side)
        Object.assign(segment, { side, until: Math.max(segment.until, state.tick + TURN_TICKS) });
      return move;
    }
  }
  const direct = candidate(0);
  return open(direct[0], direct[1]) ? direct : [0, 0];
}
