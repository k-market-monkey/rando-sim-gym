// New room rounds pin revision 2. Saved rounds without a revision retain the
// original square inset, including their deterministic replays and respawns.
import { WIDTH, HEIGHT, BORDER, stateArena } from '../content/arena.js';
export const SURVIVAL_REVISION = 2;
// The ring stops at the same inset on every arena; RING_LIMIT is where it stops.
const RING_LIMIT = 280;
// On a larger arena the inset grows in step, so the ring closes on the same
// final area at the same tick.
const scaled = (inset, limit, extra) => (extra ? inset + (inset * extra) / limit : inset);
/** The ring's bounds for a fighter of this radius; a caller holding the map passes it as the arena. */
export function survivalBounds(state, radius = 0, arena = stateArena(state)) {
  const { width, height } = arena,
    ring = state.ring || 0,
    revised = state.survivalRevision >= 2,
    x = scaled(ring, RING_LIMIT, (width - WIDTH) / 2),
    y = scaled(
      revised ? Math.min(ring, 220) : ring,
      revised ? 220 : RING_LIMIT,
      (height - HEIGHT) / 2,
    );
  return {
    minX: BORDER + radius + x,
    maxX: width - BORDER - radius - x,
    minY: BORDER + radius + y,
    maxY: height - BORDER - radius - y,
  };
}
