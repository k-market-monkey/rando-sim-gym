// Shared rules for the Composed features: walls, teleport destinations, rays and targets.
import { collisionRects, getStateMap } from '../map-state.js';
import { solidCollisionSnapshot } from '../collision-snapshots.js';
import { simulationOptimizations } from '../performance-options.js';
import { floorSupports } from '../../content/floor.js';
import { WIDTH, HEIGHT, BORDER, stateArena } from '../../content/arena.js';
import { legalFighterPosition } from '../arena-physics.js';
import { survivalBounds } from '../survival.js';
import {
  q,
  dir,
  direction,
  clamp,
  overlap,
  taperedSegmentCircle,
  beamHalfWidth,
  blockedSegment,
  solidRect,
} from './geometry.js';
import { hypot, square } from '../exact-math.js';
import { compileMove } from './compiler.js';

export function componentWalls(state) {
  const base = collisionRects(state);
  if (simulationOptimizations.collisionSnapshots) return solidCollisionSnapshot(state, base, true);
  return [
    ...base.map((w) => ({ ...w, objectId: w.id })),
    ...state.entities
      .filter((e) => e.solid && !e.removed)
      .map((e) => ({ entityId: e.id, ...solidRect(e) })),
  ];
}
export function teleportDestination(state, player, move, aimX, aimY) {
  if (move.casterAction?.kind !== 'teleport' || ![aimX, aimY].every(Number.isFinite)) return null;
  const dx = aimX - player.x,
    dy = aimY - player.y,
    distance = hypot(dx, dy);
  if (distance < 13) return null;
  const scale = Math.min(1, move.casterAction.range / distance),
    x = q(player.x + dx * scale),
    y = q(player.y + dy * scale),
    map = getStateMap(state),
    bounds = survivalBounds(state, 13);
  if (
    x < bounds.minX ||
    x > bounds.maxX ||
    y < bounds.minY ||
    y > bounds.maxY ||
    !legalFighterPosition(map, componentWalls(state), x, y) ||
    map.hazards.some((rect) => overlap(x, y, 13, rect))
  )
    return null;
  if (
    state.players.some(
      (other) =>
        other !== player && !other.dead && square(other.x - x) + square(other.y - y) < 26 * 26,
    )
  )
    return null;
  if (
    state.entities.some(
      (entity) =>
        !entity.removed &&
        entity.ttl > 0 &&
        square(entity.x - x) + square(entity.y - y) < square(13 + entity.physicalRadius),
    )
  )
    return null;
  return { x, y };
}
function hitWall(x, y, dx, dy, rect, padding) {
  let low = -Infinity,
    high = Infinity,
    nx = 0,
    ny = 0;
  for (const [origin, delta, min, max, axis] of [
    [x, dx, rect.x - padding, rect.x + rect.w + padding, 0],
    [y, dy, rect.y - padding, rect.y + rect.h + padding, 1],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let near = (min - origin) / delta,
      far = (max - origin) / delta,
      normal = -1;
    if (near > far) {
      [near, far] = [far, near];
      normal = 1;
    }
    if (near > low) {
      low = near;
      nx = axis === 0 ? normal : 0;
      ny = axis === 1 ? normal : 0;
    } else if (Math.abs(near - low) < 1e-9) {
      if (axis === 0) nx = normal;
      else ny = normal;
    }
    high = Math.min(high, far);
    if (low > high) return null;
  }
  return low >= 1 / 512 && high >= low ? { distance: low, nx, ny } : null;
}
// Four slabs around the playable area, thick enough that nothing passes through.
const SLAB = 1000;
const slabs = (width, height) => [
  { x: -SLAB, y: -SLAB, w: SLAB + BORDER, h: height + 2 * SLAB },
  { x: width - BORDER, y: -SLAB, w: SLAB + BORDER, h: height + 2 * SLAB },
  { x: -SLAB, y: -SLAB, w: width + 2 * SLAB, h: SLAB + BORDER },
  { x: -SLAB, y: height - BORDER, w: width + 2 * SLAB, h: SLAB + BORDER },
];
const defaultBoundary = slabs(WIDTH, HEIGHT);
const boundary = (state) => {
  const { width, height } = stateArena(state);
  return width === WIDTH && height === HEIGHT ? defaultBoundary : slabs(width, height);
};
/** A template that is traced as a beam: a reflected ray, or a free or linked segment. */
export const isBeam = (t) => t.ray.kind === 'reflect' || t.geometry[0].kind === 'segment';
/** Armed circles that turn beams, in entity order. */
export function beamReflectors(state) {
  return state.entities
    .filter(
      (e) =>
        !e.removed &&
        e.age > e.arm &&
        compileMove(e.move).templates[e.templateId].reflectsBeams === true,
    )
    .map((e) => ({ x: e.x, y: e.y, radius: e.geometry.radius, entityId: e.id }));
}
/** How far along (dx, dy) the beam's edge first touches the circle; null if it starts inside or misses. */
function hitReflector(x, y, dx, dy, mirror, pad) {
  const ox = x - mirror.x,
    oy = y - mirror.y,
    outside = ox * ox + oy * oy - square(mirror.radius + pad),
    along = ox * dx + oy * dy;
  if (outside <= 0 || along >= 0) return null;
  const discriminant = along * along - outside;
  return discriminant < 0 ? null : -along - Math.sqrt(discriminant);
}
/**
 * Finite total path budget, deterministic wall order and at most three wall
 * turns. A beam reaching a reflector from outside turns at its edge, mirrored
 * across the edge normal snapped to the 32 directions, without spending a wall
 * turn; one already inside passes out. `toward` gives the first leg an exact
 * direction, as a linked beam needs to reach its far anchor. A linked beam meets
 * walls along its centre line, as the earlier rule that blocked links did, so a
 * wire laid beside cover still reaches its anchor; reflectors still see its edge.
 */
export function traceRay(state, startX, startY, angle, range, bounces, width = 0, toward = null) {
  if (![startX, startY, angle, range, bounces, width].every(Number.isFinite)) return [];
  const walls = [...componentWalls(state), ...boundary(state)],
    mirrors = beamReflectors(state),
    wallPad = toward ? 1 : width / 2,
    segments = [];
  let x = startX,
    y = startY,
    remaining = clamp(range, 0, 560),
    turns = clamp(Math.floor(bounces), 0, 3),
    passed = null;
  if (
    walls.some(
      (w) =>
        x >= w.x - wallPad &&
        x <= w.x + w.w + wallPad &&
        y >= w.y - wallPad &&
        y <= w.y + w.h + wallPad,
    )
  )
    return [];
  while (remaining > 1 / 256 && segments.length < 4) {
    let [dx, dy] = toward && !segments.length ? [toward.x - x, toward.y - y] : dir(angle);
    const length = hypot(dx, dy);
    if (!length) break;
    dx /= length;
    dy /= length;
    let nearest = null;
    for (const wall of walls) {
      const hit = hitWall(x, y, dx, dy, wall, wallPad);
      if (!hit || hit.distance > remaining) continue;
      if (!nearest || hit.distance < nearest.distance - 1e-9) nearest = { ...hit, wall };
      else if (Math.abs(hit.distance - nearest.distance) < 1e-9) {
        nearest.nx ||= hit.nx;
        nearest.ny ||= hit.ny;
      }
    }
    let mirror = null;
    for (const m of mirrors) {
      if (m.entityId === passed) continue;
      const distance = hitReflector(x, y, dx, dy, m, width / 2);
      if (
        distance === null ||
        distance > remaining ||
        (nearest && distance >= nearest.distance) ||
        (mirror && distance >= mirror.distance)
      )
        continue;
      mirror = { ...m, distance };
    }
    const distance = mirror?.distance ?? nearest?.distance ?? remaining,
      endX = q(x + dx * distance),
      endY = q(y + dy * distance);
    segments.push({
      x: q(x),
      y: q(y),
      endX,
      endY,
      objectId: mirror ? null : (nearest?.wall.objectId ?? null),
      entityId: mirror ? mirror.entityId : (nearest?.wall.entityId ?? null),
    });
    remaining -= hypot(endX - x, endY - y);
    if (toward && segments.length === 1) angle = direction(dx, dy);
    if (mirror) {
      const normal = direction(endX - mirror.x, endY - mirror.y);
      angle = (((2 * normal - angle + 16) % 32) + 32) % 32;
      passed = mirror.entityId;
    } else {
      if (!nearest || turns-- === 0) break;
      if (nearest.nx) angle = 16 - angle;
      if (nearest.ny) angle = -angle;
      passed = null;
    }
    [dx, dy] = dir(angle);
    const step = hypot(dx, dy);
    x = endX + dx / step / 128;
    y = endY + dy / step / 128;
    remaining -= 1 / 128;
  }
  return segments;
}
/** Free stationary beams lock their world firing pose; setup links keep their endpoint workflow. */
export function isFixedBeam(move) {
  const t = move.templates.find((t) => t.id === move.root);
  return (
    move.setup.kind === 'none' &&
    t &&
    isBeam(t) &&
    t.motion.kind === 'stationary' &&
    !t.motion.sweep &&
    !t.solid &&
    t.actor.kind === 'none' &&
    move.casterAction?.kind !== 'teleport'
  );
}
/** Recheck the captured placement against live cover, without following the caster. */
export function fixedBeamPlacement(state, move, pose) {
  if (
    !isFixedBeam(move) ||
    !pose ||
    !['x', 'y', 'angle', 'sourceX', 'sourceY'].every((key) => Number.isFinite(pose[key])) ||
    !Number.isInteger(pose.angle) ||
    pose.angle < 0 ||
    pose.angle > 31
  )
    return null;
  const t = move.templates.find((t) => t.id === move.root),
    walls = componentWalls(state);
  if (
    walls.some((w) => overlap(pose.x, pose.y, t.physicalRadius, w)) ||
    blockedSegment(
      pose.sourceX,
      pose.sourceY,
      pose.x,
      pose.y,
      walls,
      t.origin === 'caster_center' ? 0 : t.physicalRadius,
    ) ||
    !floorSupports(getStateMap(state), pose.x, pose.y, Math.max(1, t.physicalRadius))
  )
    return null;
  if (
    t.ray.kind === 'reflect' &&
    !traceRay(state, pose.x, pose.y, pose.angle, t.ray.range, t.ray.bounces, t.geometry[0].width)
      .length
  )
    return null;
  return pose;
}
export function previewRay(
  state,
  player,
  move,
  aimX = player.aimX,
  aimY = player.aimY,
  firingPose = null,
) {
  const template = move.templates.find((t) => t.id === move.root);
  if (!template || !isBeam(template) || ![aimX, aimY].every(Number.isFinite)) return [];
  const reflect = template.ray.kind === 'reflect';
  if (firingPose) {
    const pose = fixedBeamPlacement(state, move, firingPose);
    return pose
      ? traceRay(
          state,
          pose.x,
          pose.y,
          pose.angle,
          reflect ? template.ray.range : template.geometry[0].length,
          reflect ? template.ray.bounces : 0,
          template.geometry[0].width,
        )
      : [];
  }
  const angle = direction(aimX - player.x, aimY - player.y),
    [dx, dy] = dir(angle);
  let x = player.x,
    y = player.y;
  if (template.origin === 'caster_muzzle') {
    const clearance =
      15 +
      Math.max(
        template.physicalRadius,
        ...template.geometry.map((g) =>
          ['circle', 'capsule', 'sector'].includes(g.kind) ? g.radius : g.width / 2,
        ),
      );
    x += dx * clearance;
    y += dy * clearance;
  }
  if (template.origin === 'aim_point_clamped') {
    const distance = Math.min(210, hypot(aimX - player.x, aimY - player.y));
    x += dx * distance;
    y += dy * distance;
  }
  const margin = BORDER + template.physicalRadius,
    arena = stateArena(state);
  x = q(clamp(x, margin, arena.width - margin));
  y = q(clamp(y, margin, arena.height - margin));
  const walls = componentWalls(state);
  if (
    walls.some((w) => overlap(x, y, template.physicalRadius, w)) ||
    blockedSegment(
      player.x,
      player.y,
      x,
      y,
      walls,
      template.origin === 'caster_center' ? 0 : template.physicalRadius,
    ) ||
    !floorSupports(getStateMap(state), x, y, template.physicalRadius)
  )
    return [];
  return traceRay(
    state,
    x,
    y,
    angle,
    reflect ? template.ray.range : template.geometry[0].length,
    reflect ? template.ray.bounces : 0,
    template.geometry[0].width,
  );
}
export function enemyTargets(state, owner) {
  const hostile = (other) =>
    other &&
    other.id !== owner.id &&
    !other.dead &&
    (!state.teamBattle || other.team !== owner.team);
  const actors = state.entities
    .filter(
      (e) =>
        e.actor && !e.removed && e.hp > 0 && hostile(state.players.find((p) => p.id === e.owner)),
    )
    .sort((a, b) => a.id - b.id)
    .map((e) => ({
      id: `actor:${e.id}`,
      actorId: e.id,
      actorKind: e.actor.kind,
      ownerId: e.owner,
      team: state.players.find((p) => p.id === e.owner)?.team ?? null,
      x: e.x,
      y: e.y,
      vx: q(e.x - e.previousX),
      vy: q(e.y - e.previousY),
      dead: false,
      physicalRadius: e.physicalRadius,
    }));
  const players = state.players
    .filter(hostile)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [...actors, ...players];
}
export function nearestTarget(state, owner, origin, radius) {
  return (
    enemyTargets(state, owner)
      .filter(
        (target) => square(target.x - origin.x) + square(target.y - origin.y) <= radius * radius,
      )
      .sort(
        (a, b) =>
          square(a.x - origin.x) +
          square(a.y - origin.y) -
          (square(b.x - origin.x) + square(b.y - origin.y)),
      )[0] || null
  );
}
/**
 * Whether a beam's path touches a target circle with nothing in between. A
 * tapered beam is measured at the closest point, by distance along the path
 * out of its full length `full`.
 */
export function rayHits(state, entity, target, radius = 13, excludedEntityId = null, full = 0) {
  const walls = componentWalls(state).filter((w) => w.entityId !== excludedEntityId),
    g = entity.geometry;
  let start = 0;
  return entity.raySegments.some((segment) => {
    const length =
        g.endWidth === undefined ? 0 : hypot(segment.endX - segment.x, segment.endY - segment.y),
      h0 = beamHalfWidth(g, start, full),
      h1 = beamHalfWidth(g, start + length, full);
    start += length;
    return (
      taperedSegmentCircle(
        segment.x,
        segment.y,
        segment.endX,
        segment.endY,
        h0,
        h1,
        target.x,
        target.y,
        radius,
      ) && !blockedSegment(segment.x, segment.y, target.x, target.y, walls)
    );
  });
}
