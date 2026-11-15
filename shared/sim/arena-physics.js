/** Shared deterministic surface rules for maps explicitly pinned to this revision. */
import { simulationOptimizations } from './performance-options.js';
import { diskOverlapsBox as overlaps, floorSupports } from '../content/floor.js';
import { hypot, square } from './exact-math.js';
export const MAX_FIGHTER_STEP = 14;
const q = (n) => Math.round(n * 256) / 256;
const contains = (s, x, y, margin = 0) =>
  x >= s.x - margin && x <= s.x + s.w + margin && y >= s.y - margin && y <= s.y + s.h + margin;
export function legalFighterPosition(map, rects, x, y, radius = 13) {
  return (
    x >= 33 &&
    x <= map.width - 33 &&
    y >= 33 &&
    y <= map.height - 33 &&
    floorSupports(map, x, y, radius) &&
    !rects.some((r) => overlaps(x, y, radius, r))
  );
}

/** Substeps of at most four units and ten bisections per blocked axis: dash cannot skip
 * a gap. A faster room raises `maxStep`; the substeps stay four units long. */
export function moveOnFloor(map, rects, p, dx, dy, maxStep = MAX_FIGHTER_STEP) {
  const length = hypot(dx, dy),
    scale = length > maxStep ? maxStep / length : 1;
  dx *= scale;
  dy *= scale;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4)),
    sx = dx / steps,
    sy = dy / steps;
  let blockedX = false,
    blockedY = false;
  for (let i = 0; i < steps; i++)
    for (const [axis, delta] of /** @type {['x' | 'y', number][]} */ ([
      ['x', sx],
      ['y', sy],
    ])) {
      if (!delta) continue;
      const start = p[axis],
        valid = (value) =>
          legalFighterPosition(map, rects, axis === 'x' ? value : p.x, axis === 'y' ? value : p.y);
      if (valid(start + delta)) {
        p[axis] = q(start + delta);
        continue;
      }
      let low = 0,
        high = 1;
      for (let n = 0; n < 10; n++) {
        const mid = (low + high) / 2;
        if (valid(start + delta * mid)) low = mid;
        else high = mid;
      }
      // Round toward the last legal center so quantization cannot cross a boundary.
      const raw = start + delta * low;
      p[axis] = (delta > 0 ? Math.floor(raw * 256) : Math.ceil(raw * 256)) / 256;
      if (axis === 'x') blockedX = true;
      else blockedY = true;
    }
  return { blockedX, blockedY };
}
export function controllerMotion(controller, x, y) {
  const c = controller,
    speed = c.speed;
  if (c.kind === 'rotation') {
    const dx = x - c.x,
      dy = y - c.y,
      r = hypot(dx, dy);
    return r <= c.radius
      ? { x: (-dy / c.radius) * speed, y: (dx / c.radius) * speed }
      : { x: 0, y: 0 };
  }
  if (c.kind !== 'perimeter' || !contains(c, x, y)) return { x: 0, y: 0 };
  const left = c.x + c.inset,
    right = c.x + c.w - c.inset,
    top = c.y + c.inset,
    bottom = c.y + c.h - c.inset;
  if (x > left && x < right && y > top && y < bottom) return { x: 0, y: 0 };
  if (x >= left && x <= right) return y <= top ? { x: speed, y: 0 } : { x: -speed, y: 0 };
  if (y >= top && y <= bottom) return x >= right ? { x: 0, y: speed } : { x: 0, y: -speed };
  const cx = x < left ? left : right,
    cy = y < top ? top : bottom,
    dx = x - cx,
    dy = y - cy,
    d = hypot(dx, dy) || 1;
  return { x: (-dy / d) * speed, y: (dx / d) * speed };
}
export function surfaceVelocity(map, p) {
  if (p.dashTicks > 0) return { x: 0, y: 0 };
  let x = 0,
    y = 0;
  for (const c of map.controllers || []) {
    const v = controllerMotion(c, p.x, p.y);
    x += v.x;
    y += v.y;
  }
  const length = hypot(x, y),
    scale = length > 2.25 ? 2.25 / length : 1;
  return { x: q(x * scale), y: q(y * scale) };
}
export function resetSurfaceState(p) {
  Object.assign(p, { walkMomentumX: 0, walkMomentumY: 0, surfaceGrip: null, dashResidual: false });
}
function gripSurface(map, p) {
  const margin = map.physics?.hysteresis || 0,
    old = map.surfaces.find((s) => s.id === p.surfaceGrip && s.kind === 'grip');
  const selected =
    old && contains(old, p.x, p.y, margin)
      ? old
      : map.surfaces.find((s) => s.kind === 'grip' && contains(s, p.x, p.y, -margin));
  p.surfaceGrip = selected?.id || null;
  return !!selected;
}
/** Input remains world-relative. Walk inertia, impulses, force response and floor
 * transport are separate state contributions with one final speed ceiling. */
export function advanceSurfaceMovement(map, p, ux, uy, speed) {
  if (p.dashTicks > 0) {
    p.walkMomentumX = 0;
    p.walkMomentumY = 0;
    p.dashResidual = true;
    return { x: p.vx, y: p.vy };
  }
  const physics = map.physics,
    grip = physics ? gripSurface(map, p) : false;
  if (physics) {
    if (!ux && !uy) {
      const friction = grip ? physics.gripFriction : physics.friction;
      p.walkMomentumX = q(p.walkMomentumX * friction);
      p.walkMomentumY = q(p.walkMomentumY * friction);
    } else {
      const ax = ux * speed - p.walkMomentumX,
        ay = uy * speed - p.walkMomentumY,
        length = hypot(ax, ay),
        scale = Math.min(
          1,
          (grip ? physics.gripAcceleration : physics.acceleration) / (length || 1),
        );
      p.walkMomentumX = q(p.walkMomentumX + ax * scale);
      p.walkMomentumY = q(p.walkMomentumY + ay * scale);
    }
  } else {
    p.walkMomentumX = q(ux * speed);
    p.walkMomentumY = q(uy * speed);
  }
  // Keep knockback bounded without confusing it with retained walk velocity.
  const impulse = hypot(p.vx, p.vy);
  if (impulse > 14) {
    p.vx = q((p.vx * 14) / impulse);
    p.vy = q((p.vy * 14) / impulse);
  }
  const transport = surfaceVelocity(map, p);
  return {
    x: p.walkMomentumX + p.vx + p.fieldX + transport.x,
    y: p.walkMomentumY + p.vy + p.fieldY + transport.y,
  };
}
export function finishSurfaceMovement(map, p, wasDashing, collision) {
  if (wasDashing && p.dashTicks === 0) {
    p.walkMomentumX = 0;
    p.walkMomentumY = 0;
    p.fieldX = 0;
    p.fieldY = 0;
  }
  const physics = map.physics,
    friction = p.dashTicks
      ? 0.94
      : p.dashResidual
        ? 0.72
        : physics
          ? p.surfaceGrip
            ? physics.gripImpulseFriction
            : physics.impulseFriction
          : 0.72;
  p.vx = q(p.vx * friction);
  p.vy = q(p.vy * friction);
  if (hypot(p.vx, p.vy) < 0.05) {
    p.vx = 0;
    p.vy = 0;
    p.dashResidual = false;
  }
  if (collision.blockedX) {
    p.walkMomentumX = 0;
    p.vx = 0;
    p.fieldX = 0;
  }
  if (collision.blockedY) {
    p.walkMomentumY = 0;
    p.vy = 0;
    p.fieldY = 0;
  }
}

/** Bounded four-neighbor path search over the arena's 40-unit cells. Cover and gaps both block fighters;
 * a destroyed panel is traversable only after its map-boundary commit. */
function uncachedRouteOnFloor(map, rects, start, goal) {
  const columns = map.width / 40,
    rows = map.height / 40,
    cells = columns * rows,
    valid = new Uint8Array(cells),
    index = (x, y) => y * columns + x;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++)
      if (legalFighterPosition(map, rects, x * 40 + 20, y * 40 + 20)) valid[index(x, y)] = 1;
  const nearest = (point) => {
    let chosen = -1,
      distance = Infinity;
    for (let i = 0; i < cells; i++)
      if (valid[i]) {
        const d =
          square((i % columns) * 40 + 20 - point.x) +
          square(Math.floor(i / columns) * 40 + 20 - point.y);
        if (d < distance) {
          distance = d;
          chosen = i;
        }
      }
    return chosen;
  };
  const first = nearest(start),
    last = nearest(goal);
  if (first < 0 || last < 0) return [];
  const parents = new Int16Array(cells).fill(-1),
    queue = [first];
  parents[first] = first;
  for (let n = 0; n < queue.length && parents[last] < 0; n++) {
    const cell = queue[n],
      x = cell % columns,
      y = Math.floor(cell / columns);
    for (const [nx, ny] of [
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
      [x, y - 1],
    ])
      if (nx >= 0 && nx < columns && ny >= 0 && ny < rows) {
        const next = index(nx, ny);
        if (valid[next] && parents[next] < 0) {
          parents[next] = cell;
          queue.push(next);
        }
      }
  }
  if (parents[last] < 0) return [];
  const path = [];
  for (let cell = last; cell !== first; cell = parents[cell])
    path.push([(cell % columns) * 40 + 20, Math.floor(cell / columns) * 40 + 20]);
  path.push([(first % columns) * 40 + 20, Math.floor(first / columns) * 40 + 20]);
  return path.reverse();
}

const MAX_GEOMETRIES = 4,
  MAX_SOURCE_TREES = 96;
let navigationCaches = new WeakMap();
export function resetNavigationCache() {
  navigationCaches = new WeakMap();
}
export function navigationCacheInfo(map) {
  const variants = navigationCaches.get(map)?.variants || [];
  return {
    geometryVariants: variants.length,
    sourceTrees: variants.map((entry) => entry.trees.size),
  };
}
function sameRects(saved, rects) {
  if (saved.length !== rects.length) return false;
  for (let i = 0; i < saved.length; i++) {
    const a = saved[i],
      b = rects[i];
    if (
      !Object.is(a.x, b.x) ||
      !Object.is(a.y, b.y) ||
      !Object.is(a.w, b.w) ||
      !Object.is(a.h, b.h)
    )
      return false;
  }
  return true;
}
function navigationGrid(map, rects) {
  let cached = navigationCaches.get(map);
  // Registry definitions are deeply frozen. Custom mutable maps still invalidate
  // when floor support changes, so test/restored inputs cannot reuse stale grids.
  if (
    !cached ||
    (!cached.immutable &&
      (cached.width !== map.width ||
        cached.height !== map.height ||
        cached.tileSize !== map.tileSize ||
        cached.mask?.length !== map.floorMask?.length ||
        cached.mask?.some((row, i) => row !== map.floorMask[i])))
  ) {
    cached = {
      immutable: Object.isFrozen(map) && (!map.floorMask || Object.isFrozen(map.floorMask)),
      width: map.width,
      height: map.height,
      tileSize: map.tileSize,
      mask: map.floorMask?.slice(),
      variants: [],
    };
    navigationCaches.set(map, cached);
  }
  const variants = cached.variants;
  let found = -1;
  for (let i = 0; i < variants.length; i++) {
    const entry = variants[i];
    if ((entry.immutable && entry.source === rects) || sameRects(entry.rects, rects)) {
      found = i;
      break;
    }
  }
  if (found >= 0) {
    const [entry] = variants.splice(found, 1);
    variants.push(entry);
    return entry;
  }
  const columns = map.width / 40,
    rows = map.height / 40,
    valid = new Uint8Array(columns * rows),
    legal = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++)
      if (legalFighterPosition(map, rects, x * 40 + 20, y * 40 + 20)) {
        const cell = y * columns + x;
        valid[cell] = 1;
        legal.push(cell);
      }
  const immutable = Object.isFrozen(rects) && rects.every(Object.isFrozen),
    entry = {
      source: immutable ? rects : null,
      immutable,
      rects: rects.map(({ x, y, w, h }) => ({ x, y, w, h })),
      columns,
      rows,
      valid,
      legal,
      trees: new Map(),
    };
  variants.push(entry);
  if (variants.length > MAX_GEOMETRIES) variants.shift();
  return entry;
}
function sourceTree(grid, first) {
  let parents = grid.trees.get(first);
  if (parents) {
    grid.trees.delete(first);
    grid.trees.set(first, parents);
    return parents;
  }
  const { columns, rows } = grid;
  parents = new Int16Array(columns * rows).fill(-1);
  const queue = new Int16Array(columns * rows);
  queue[0] = first;
  parents[first] = first;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const cell = queue[head],
      x = cell % columns,
      y = Math.floor(cell / columns);
    // Preserve the original first-discovery parent order: right, down, left, up.
    for (let direction = 0; direction < 4; direction++) {
      const next =
        direction === 0
          ? x < columns - 1
            ? cell + 1
            : -1
          : direction === 1
            ? y < rows - 1
              ? cell + columns
              : -1
            : direction === 2
              ? x > 0
                ? cell - 1
                : -1
              : y > 0
                ? cell - columns
                : -1;
      if (next >= 0 && grid.valid[next] && parents[next] < 0) {
        parents[next] = cell;
        queue[tail++] = next;
      }
    }
  }
  grid.trees.set(first, parents);
  if (grid.trees.size > MAX_SOURCE_TREES) grid.trees.delete(grid.trees.keys().next().value);
  return parents;
}
export function routeOnFloor(map, rects, start, goal) {
  if (!simulationOptimizations.navigation) return uncachedRouteOnFloor(map, rects, start, goal);
  const grid = navigationGrid(map, rects),
    { columns, rows } = grid,
    nearest = (point) => {
      // Game positions are quantized to 1/256. Within these bounds the squared
      // distances are exact binary values, so lattice ties agree with row-major
      // scanning. Unquantized/extreme inputs retain the original arithmetic.
      if (
        Math.abs(point.x) <= 4096 &&
        Math.abs(point.y) <= 4096 &&
        Number.isInteger(point.x * 256) &&
        Number.isInteger(point.y * 256)
      ) {
        const x = Math.max(0, Math.min(columns - 1, Math.ceil((point.x - 20) / 40 - 0.5))),
          y = Math.max(0, Math.min(rows - 1, Math.ceil((point.y - 20) / 40 - 0.5))),
          cell = y * columns + x;
        if (grid.valid[cell]) return cell;
      }
      let chosen = -1,
        distance = Infinity;
      for (const cell of grid.legal) {
        const d =
          square((cell % columns) * 40 + 20 - point.x) +
          square(Math.floor(cell / columns) * 40 + 20 - point.y);
        if (d < distance) {
          distance = d;
          chosen = cell;
        }
      }
      return chosen;
    };
  const first = nearest(start),
    last = nearest(goal);
  if (first < 0 || last < 0) return [];
  const parents = sourceTree(grid, first);
  if (parents[last] < 0) return [];
  const path = [];
  for (let cell = last; cell !== first; cell = parents[cell])
    path.push([(cell % columns) * 40 + 20, Math.floor(cell / columns) * 40 + 20]);
  path.push([(first % columns) * 40 + 20, Math.floor(first / columns) * 40 + 20]);
  return path.reverse();
}
