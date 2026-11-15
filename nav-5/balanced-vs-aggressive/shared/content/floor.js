// Which parts of a map hold a fighter up. A map with a floor mask has gaps
// (water, drops) that stop fighters and grounded placement; a map without one
// is floor everywhere.
import { TILE } from './arena.js';
/** The surface rules a map with a floor mask is pinned to. */
export const ARENA_RULESET = 'arena-surfaces-v1';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
/** Whether a disk overlaps a box by more than a rounding error. */
export const diskOverlapsBox = (x, y, r, b) => {
  const dx = x - clamp(x, b.x, b.x + b.w),
    dy = y - clamp(y, b.y, b.y + b.h);
  return dx * dx + dy * dy < r * r - 1e-8;
};
export const hasArenaPhysics = (map) => map.requiredRuleset === ARENA_RULESET;

/** Exact disk versus the union of authored tiles. No floor means legacy full canvas. */
export function floorSupports(map, x, y, radius = 0) {
  if (!map.floorMask) return true;
  if (
    ![x, y, radius].every(Number.isFinite) ||
    radius < 0 ||
    x - radius < 0 ||
    x + radius > map.width ||
    y - radius < 0 ||
    y + radius > map.height
  )
    return false;
  const size = map.tileSize;
  if (radius === 0) return map.floorMask[Math.floor(y / size)]?.[Math.floor(x / size)] === '#';
  for (
    let row = Math.max(0, Math.floor((y - radius) / size));
    row <= Math.min(map.height / size - 1, Math.floor((y + radius) / size));
    row++
  )
    for (
      let col = Math.max(0, Math.floor((x - radius) / size));
      col <= Math.min(map.width / size - 1, Math.floor((x + radius) / size));
      col++
    )
      if (
        map.floorMask[row][col] !== '#' &&
        diskOverlapsBox(x, y, radius, { x: col * size, y: row * size, w: size, h: size })
      )
        return false;
  return true;
}
export function floorSupportsBox(map, box) {
  if (!map.floorMask) return true;
  if (box.x < 0 || box.y < 0 || box.x + box.w > map.width || box.y + box.h > map.height)
    return false;
  for (let row = Math.floor(box.y / TILE); row <= Math.ceil((box.y + box.h) / TILE) - 1; row++)
    for (let col = Math.floor(box.x / TILE); col <= Math.ceil((box.x + box.w) / TILE) - 1; col++)
      if (map.floorMask[row]?.[col] !== '#') return false;
  return true;
}
