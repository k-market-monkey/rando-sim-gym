/** Quantized geometry shared by every recipe. No per-weapon collision code. */
import { simulationOptimizations } from '../performance-options.js';
import { hypot, square } from '../exact-math.js';
export const q = (n) => Math.round(n * 256) / 256;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const DIR = [
  [1024, 0],
  [1004, 200],
  [946, 392],
  [851, 569],
  [724, 724],
  [569, 851],
  [392, 946],
  [200, 1004],
  [0, 1024],
  [-200, 1004],
  [-392, 946],
  [-569, 851],
  [-724, 724],
  [-851, 569],
  [-946, 392],
  [-1004, 200],
  [-1024, 0],
  [-1004, -200],
  [-946, -392],
  [-851, -569],
  [-724, -724],
  [-569, -851],
  [-392, -946],
  [-200, -1004],
  [0, -1024],
  [200, -1004],
  [392, -946],
  [569, -851],
  [724, -724],
  [851, -569],
  [946, -392],
  [1004, -200],
];
export const dir = (a) => {
  const d = DIR[((Math.round(a) % 32) + 32) % 32];
  return [d[0] / 1024, d[1] / 1024];
};
export function unit(x, y) {
  const length = Math.sqrt(x * x + y * y);
  return length ? [q(x / length), q(y / length)] : [1, 0];
}
export function direction(x, y) {
  let best = 0,
    dot = -Infinity;
  for (let i = 0; i < 32; i++) {
    const v = x * DIR[i][0] + y * DIR[i][1];
    if (v > dot) {
      best = i;
      dot = v;
    }
  }
  return best;
}
/** The nearest of right (0), down (8), left (16) and up (24) to an angle in
 * 32ths of a turn. A solid object always faces one of these. */
export const axisAngle = (a) => (((Math.round(a / 8) % 4) + 4) % 4) * 8;
/** The rectangle a solid box covers: from its x, y it extends `length` in the
 * direction of its angle, and `width` across, centred on that line. */
export function solidRect({ x, y, angle = 0, geometry: g }) {
  const { length, width } = g;
  if (angle === 8) return { x: x - width / 2, y, w: width, h: length };
  if (angle === 16) return { x: x - length, y: y - width / 2, w: length, h: width };
  if (angle === 24) return { x: x - width / 2, y: y - length, w: width, h: length };
  return { x, y: y - width / 2, w: length, h: width };
}
export const inside = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export function overlap(x, y, r, w) {
  return square(x - clamp(x, w.x, w.x + w.w)) + square(y - clamp(y, w.y, w.y + w.h)) < r * r;
}
export function segmentCircle(ax, ay, bx, by, x, y, r) {
  const dx = bx - ax,
    dy = by - ay,
    l = dx * dx + dy * dy,
    t = l ? clamp(((x - ax) * dx + (y - ay) * dy) / l, 0, 1) : 0;
  return square(x - ax - dx * t) + square(y - ay - dy * t) <= r * r;
}
export function segmentRect(ax, ay, bx, by, w, pad = 0) {
  let lo = 0,
    hi = 1;
  const dx = bx - ax,
    dy = by - ay;
  for (const [origin, delta, min, max] of [
    [ax, dx, w.x - pad, w.x + w.w + pad],
    [ay, dy, w.y - pad, w.y + w.h + pad],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let t0 = (min - origin) / delta,
      t1 = (max - origin) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  return true;
}
export const blockedSegment = (ax, ay, bx, by, walls, pad = 0) =>
  walls.some((w) => segmentRect(ax, ay, bx, by, w, pad));
/**
 * Half the width of a beam `distance` along its full length `full`: it grows
 * linearly from `width` at the origin to `endWidth` at the far end.
 */
export function beamHalfWidth(g, distance, full) {
  if (g.endWidth === undefined || !(full > 0)) return g.width / 2;
  return (g.width + (g.endWidth - g.width) * clamp(distance / full, 0, 1)) / 2;
}
/** The widest a beam gets, for broad phases and padding. */
export const beamMaxWidth = (g) => Math.max(g.width, g.endWidth ?? g.width);
/** How far a beam of full length `full` reaches `age` ticks after spawn. */
export const extendedLength = (g, full, age) =>
  g.extend > 0 ? (full * clamp(age, 0, g.extend)) / g.extend : full;
/** Whether a target circle touches a segment whose half-width tapers from `h0` at a to `h1` at b. */
export function taperedSegmentCircle(ax, ay, bx, by, h0, h1, x, y, r) {
  const dx = bx - ax,
    dy = by - ay,
    l = dx * dx + dy * dy,
    t = l ? clamp(((x - ax) * dx + (y - ay) * dy) / l, 0, 1) : 0;
  return square(x - ax - dx * t) + square(y - ay - dy * t) <= square(h0 + (h1 - h0) * t + r);
}
export function staticShapeHit(g, x, y, angle, tx, ty, r, linkTo = null) {
  const [dx, dy] = dir(angle),
    rx = tx - x,
    ry = ty - y,
    along = rx * dx + ry * dy,
    cross = -rx * dy + ry * dx;
  if (g.kind === 'circle') return rx * rx + ry * ry <= square(g.radius + r);
  if (g.kind === 'capsule' || g.kind === 'segment') {
    const end = linkTo || { x: x + dx * g.length, y: y + dy * g.length };
    if (g.kind === 'segment' && g.endWidth !== undefined && !linkTo)
      return taperedSegmentCircle(x, y, end.x, end.y, g.width / 2, g.endWidth / 2, tx, ty, r);
    return segmentCircle(
      x,
      y,
      end.x,
      end.y,
      tx,
      ty,
      (g.kind === 'capsule' ? g.radius : g.width / 2) + r,
    );
  }
  if (g.kind === 'box')
    return (
      square(along - clamp(along, 0, g.length)) +
        square(cross - clamp(cross, -g.width / 2, g.width / 2)) <=
      r * r
    );
  const distance = Math.sqrt(rx * rx + ry * ry);
  if (distance > g.radius + r || distance + r < g.innerRadius) return false;
  if (g.arc === 32 || distance <= r) return true;
  const edge = Math.ceil(g.arc / 2),
    [ex] = dir(edge);
  if (along >= distance * ex - r) return true;
  // Rounded overlap against either radial boundary of an annular sector.
  for (const side of [-1, 1]) {
    const [sx, sy] = dir(angle + side * edge);
    if (
      segmentCircle(
        x + sx * g.innerRadius,
        y + sy * g.innerRadius,
        x + sx * g.radius,
        y + sy * g.radius,
        tx,
        ty,
        r,
      )
    )
      return true;
  }
  return false;
}
// DIR is quantized rather than exactly unit length. In particular the box
// narrow phase transforms target coordinates by that length; include its
// reciprocal when bounding both the shape and the target's padded radius.
const maxDirectionLength = Math.max(...DIR.map(([x, y]) => hypot(x, y) / 1024));
const inverseMinDirectionLength = 1 / Math.min(...DIR.map(([x, y]) => hypot(x, y) / 1024));
function outsideSweep(e, minX, minY, maxX, maxY, padding = 0) {
  let reach = 0;
  for (const g of e.geometries) {
    let size;
    switch (g.kind) {
      case 'circle':
      case 'sector':
        size = Math.abs(g.radius);
        break;
      case 'capsule':
        size = Math.abs(g.length) * maxDirectionLength + Math.abs(g.radius);
        break;
      case 'segment':
        size = Math.abs(g.length) * maxDirectionLength + Math.abs(beamMaxWidth(g)) / 2;
        break;
      case 'box':
        size = hypot(g.length, g.width / 2) * inverseMinDirectionLength;
        break;
      default:
        return false;
    }
    reach = Math.max(reach, size);
  }
  reach += Math.abs(padding) * Math.max(1, inverseMinDirectionLength) + 1 / 256;
  const left = Math.min(e.previousX, e.x, e.linkTo?.x ?? e.x) - reach,
    right = Math.max(e.previousX, e.x, e.linkTo?.x ?? e.x) + reach;
  const top = Math.min(e.previousY, e.y, e.linkTo?.y ?? e.y) - reach,
    bottom = Math.max(e.previousY, e.y, e.linkTo?.y ?? e.y) + reach;
  // Malformed/nonfinite inputs must fall through to the original predicates.
  if (!Number.isFinite(left + right + top + bottom + minX + maxX + minY + maxY)) return false;
  return maxX < left || minX > right || maxY < top || minY > bottom;
}
export function hitEntity(e, target, r = 13) {
  if (
    simulationOptimizations.broadPhase &&
    outsideSweep(e, target.x, target.y, target.x, target.y, r)
  )
    return false;
  for (const g of e.geometries) {
    if (
      g.kind === 'circle' &&
      segmentCircle(e.previousX, e.previousY, e.x, e.y, target.x, target.y, g.radius + r)
    )
      return true;
    // Angular and translational sweeps are bounded by 32 table directions and 18 px/tick.
    const turn = e.angle - e.previousAngle,
      steps = Math.max(
        1,
        Math.min(
          32,
          Math.max(
            Math.ceil(Math.abs(turn)),
            Math.ceil(hypot(e.x - e.previousX, e.y - e.previousY) / 4),
          ),
        ),
      );
    for (let i = 0; i <= steps; i++)
      if (
        staticShapeHit(
          g,
          e.previousX + ((e.x - e.previousX) * i) / steps,
          e.previousY + ((e.y - e.previousY) * i) / steps,
          e.previousAngle + (turn * i) / steps,
          target.x,
          target.y,
          r,
          e.linkTo,
        )
      )
        return true;
  }
  return false;
}
export function hitRect(e, w) {
  if (simulationOptimizations.broadPhase && outsideSweep(e, w.x, w.y, w.x + w.w, w.y + w.h))
    return false;
  const x = clamp(e.x, w.x, w.x + w.w),
    y = clamp(e.y, w.y, w.y + w.h);
  if (hitEntity(e, { x, y }, 0)) return true;
  for (const [px, py] of [
    [w.x, w.y],
    [w.x + w.w, w.y],
    [w.x, w.y + w.h],
    [w.x + w.w, w.y + w.h],
    [w.x + w.w / 2, w.y + w.h / 2],
  ])
    if (hitEntity(e, { x: px, y: py }, 0)) return true;
  return e.geometries.some(
    (g) => g.kind === 'circle' && segmentRect(e.previousX, e.previousY, e.x, e.y, w, g.radius),
  );
}
/** Bounded broad phase for neutral/owned objects; fighters are at most four. */
export function spatialIndex(objects, cell = 80) {
  if (simulationOptimizations.broadPhase && objects.length === 0) return { query: () => [] };
  const cells = new Map();
  for (const o of objects) {
    const radius = o.queryRadius || o.physicalRadius || 16;
    for (let x = Math.floor((o.x - radius) / cell); x <= Math.floor((o.x + radius) / cell); x++)
      for (let y = Math.floor((o.y - radius) / cell); y <= Math.floor((o.y + radius) / cell); y++) {
        const key = `${x},${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(o);
      }
  }
  return {
    query(x, y, r) {
      const seen = new Set(),
        out = [];
      for (let a = Math.floor((x - r) / cell); a <= Math.floor((x + r) / cell); a++)
        for (let b = Math.floor((y - r) / cell); b <= Math.floor((y + r) / cell); b++)
          for (const o of cells.get(`${a},${b}`) || [])
            if (!seen.has(o.id)) {
              seen.add(o.id);
              out.push(o);
            }
      return out.sort((a, b) => a.id - b.id);
    },
  };
}
