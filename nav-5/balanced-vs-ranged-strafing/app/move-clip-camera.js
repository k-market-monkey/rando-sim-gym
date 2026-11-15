/**
 * Close-up framing for move clips. Pure world-space math: the view follows the
 * focused fighter, widens to keep the nearest living opponent in frame, and
 * never leaves the arena. The view keeps the arena's aspect ratio.
 */
export const CLIP_MAX_ZOOM = 1.8;
const MARGIN = 70;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** @returns {{ x: number, y: number, width: number, height: number }} view rectangle */
export function clipView(state, focusId, arena, { maxZoom = CLIP_MAX_ZOOM } = {}) {
  const aspect = arena.width / arena.height,
    minWidth = arena.width / maxZoom,
    focus = state?.players?.find((player) => player.id === focusId);
  if (!focus) return { x: 0, y: 0, width: arena.width, height: arena.height };
  let opponent = null,
    best = Infinity;
  for (const player of state.players) {
    if (player.id === focusId || player.dead) continue;
    const distance = Math.abs(player.x - focus.x) + Math.abs(player.y - focus.y);
    if (distance < best) [opponent, best] = [player, distance];
  }
  const left = Math.min(focus.x, opponent?.x ?? focus.x),
    right = Math.max(focus.x, opponent?.x ?? focus.x),
    top = Math.min(focus.y, opponent?.y ?? focus.y),
    bottom = Math.max(focus.y, opponent?.y ?? focus.y),
    width = clamp(
      Math.max(right - left + 2 * MARGIN, (bottom - top + 2 * MARGIN) * aspect),
      minWidth,
      arena.width,
    ),
    height = width / aspect;
  return {
    x: clamp((left + right) / 2 - width / 2, 0, arena.width - width),
    y: clamp((top + bottom) / 2 - height / 2, 0, arena.height - height),
    width,
    height,
  };
}

/** Move a fraction of the way toward the target view; null previous snaps. */
export function easeView(previous, target, amount = 0.12) {
  if (!previous) return { ...target };
  const step = (key) => previous[key] + (target[key] - previous[key]) * amount;
  return { x: step('x'), y: step('y'), width: step('width'), height: step('height') };
}
