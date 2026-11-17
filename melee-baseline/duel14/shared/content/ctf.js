// The objective pickup area must remain accessible to a fighter's whole body.
import { ITEM_RADIUS } from './items.js';
import { BORDER, TILE } from './arena.js';
import { diskOverlapsBox, floorSupports } from './floor.js';
export const FLAG_TOUCH_RADIUS = ITEM_RADIUS + 13;

/** Validate authored base clearances and connectivity with initial terrain intact. */
export function validateCtfBases(map) {
  if (!map.supportedModes?.includes('ctf')) {
    if (map.ctfBases) throw Error('Flag bases require CTF support.');
    return;
  }
  const rects = [...map.walls, ...map.objects, ...map.hazards],
    safe = (x, y, radius = 13) =>
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x - radius >= BORDER &&
      y - radius >= BORDER &&
      x + radius <= map.width - BORDER &&
      y + radius <= map.height - BORDER &&
      floorSupports(map, x, y, radius) &&
      !rects.some((rect) => diskOverlapsBox(x, y, radius, rect)),
    connected = (a, b) => {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / 8));
      for (let i = 0; i <= steps; i++)
        if (!safe(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)) return false;
      return true;
    },
    columns = map.width / TILE,
    rows = map.height / TILE,
    cells = Array.from({ length: columns * rows }, (_, index) => ({
      x: (index % columns) * TILE + TILE / 2,
      y: Math.floor(index / columns) * TILE + TILE / 2,
    })),
    legal = cells.map((point) => safe(point.x, point.y));
  for (const count of [2, 3, 4]) {
    const bases = map.ctfBases?.[count];
    if (!Array.isArray(bases) || bases.length !== count) throw Error('Missing CTF base layout.');
    for (const [index, base] of bases.entries()) {
      if (!safe(base.x, base.y, FLAG_TOUCH_RADIUS))
        throw Error('CTF base pickup area is obstructed.');
      if (
        bases
          .slice(0, index)
          .some(
            (other) =>
              (base.x - other.x) * (base.x - other.x) + (base.y - other.y) * (base.y - other.y) <=
              4 * FLAG_TOUCH_RADIUS * FLAG_TOUCH_RADIUS,
          )
      )
        throw Error('CTF bases must be separate.');
    }
    const first = cells.findIndex((point, index) => legal[index] && connected(bases[0], point));
    if (first < 0) throw Error('CTF base has no reachable floor route.');
    const seen = new Set([first]),
      queue = [first];
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head],
        x = index % columns,
        y = Math.floor(index / columns);
      for (const next of [
        x + 1 < columns ? index + 1 : -1,
        y + 1 < rows ? index + columns : -1,
        x > 0 ? index - 1 : -1,
        y > 0 ? index - columns : -1,
      ])
        if (next >= 0 && !seen.has(next) && legal[next] && connected(cells[index], cells[next])) {
          seen.add(next);
          queue.push(next);
        }
    }
    if (bases.some((base) => !queue.some((index) => connected(base, cells[index]))))
      throw Error('CTF bases are disconnected.');
  }
}
