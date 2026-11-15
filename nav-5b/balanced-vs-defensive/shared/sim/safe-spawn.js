import { square } from './exact-math.js';
/** Deterministic, bounded spawn placement. Bounds describe legal fighter centers. */
const q = (value) => Math.round(value * 256) / 256;
export function overlapsSpawnRect(x, y, radius, rect) {
  const dx = x - Math.max(rect.x, Math.min(rect.x + rect.w, x)),
    dy = y - Math.max(rect.y, Math.min(rect.y + rect.h, y));
  return dx * dx + dy * dy < radius * radius;
}
/**
 * @typedef {{minX: number, maxX: number, minY: number, maxY: number, radius?: number,
 *   rects?: {x: number, y: number, w: number, h: number}[],
 *   circles?: {x: number, y: number, radius: number}[],
 *   blocked?: (x: number, y: number) => boolean}} SpawnRules
 */
/**
 * @param {number} x
 * @param {number} y
 * @param {SpawnRules} rules
 */
export function safeSpawnPoint(
  x,
  y,
  { minX, maxX, minY, maxY, radius = 13, rects = [], circles = [], blocked = () => false },
) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= minX &&
    x <= maxX &&
    y >= minY &&
    y <= maxY &&
    !rects.some((rect) => overlapsSpawnRect(x, y, radius, rect)) &&
    !circles.some(
      (circle) => square(x - circle.x) + square(y - circle.y) < square(radius + circle.radius),
    ) &&
    !blocked(x, y)
  );
}
/** @param {SpawnRules & {candidates?: number[][]}} options */
export function findSafeSpawn({ candidates = [], ...rules }) {
  const { minX, maxX, minY, maxY } = rules;
  if (![minX, maxX, minY, maxY].every(Number.isFinite) || minX > maxX || minY > maxY) return null;
  // Keep existing authored candidates and their order whenever one is safe.
  for (const point of candidates)
    if (point && safeSpawnPoint(point[0], point[1], rules)) return [point[0], point[1]];
  const center = [q((minX + maxX) / 2), q((minY + maxY) / 2)];
  if (safeSpawnPoint(center[0], center[1], rules)) return center;
  // At the largest 1440x960 arena bounds this is at most 54*36 checks; at the
  // default 960x640 bounds, 36*24. Each cell remains at most one fighter
  // diameter wide, including the short final cell.
  const columns = Math.min(53, Math.max(1, Math.ceil((maxX - minX) / 26))),
    rows = Math.min(35, Math.max(1, Math.ceil((maxY - minY) / 26)));
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const x = q(minX + ((maxX - minX) * column) / columns),
        y = q(minY + ((maxY - minY) * row) / rows);
      if (safeSpawnPoint(x, y, rules)) return [x, y];
    }
  return null;
}
