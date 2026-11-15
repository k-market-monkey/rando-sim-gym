// The part of a match's state that belongs to its map: breakable objects, moving
// surfaces and spawn points. The map itself is content and never changes; a
// state pins it by ID and revision.
import { simulationSpawn } from './calibration-rules.js';
import { mechanicsVersionForFormat } from '../protocol/versions.js';
import { getMap } from '../content/maps/catalog.js';
import { ARENA_RULESET, floorSupports, hasArenaPhysics } from '../content/floor.js';
import { survivalBounds } from './survival.js';
import { findSafeSpawn } from './safe-spawn.js';
import { solidRect, staticShapeHit } from './composed/geometry.js';
import { surfaceVelocity } from './arena-physics.js';
import { simulationOptimizations } from './performance-options.js';
import { mapCollisionSnapshot } from './collision-snapshots.js';
import { hypot, square } from './exact-math.js';
const overlaps = (x, y, radius, r) => {
  const dx = x - Math.max(r.x, Math.min(r.x + r.w, x)),
    dy = y - Math.max(r.y, Math.min(r.y + r.h, y));
  return dx * dx + dy * dy < radius * radius;
};
/** Simulation and rendering always follow the snapshot's pin, never latest. */
export function getStateMap(state) {
  if (state.map?.id && state.map.id !== state.stage)
    throw Error('Snapshot map ID does not match its stage.');
  return getMap(
    state.stage,
    state.mechanicsVersion || mechanicsVersionForFormat(state.formatVersion)?.id,
    state.map?.revision ?? state.mapRevision ?? 1,
  );
}
export function createMapState(def) {
  return {
    id: def.id,
    revision: def.revision,
    ...(hasArenaPhysics(def)
      ? {
          ruleset: ARENA_RULESET,
          controllers: def.controllers.map((c) => ({ id: c.id, phase: 0 })),
        }
      : {}),
    objects: def.objects.map((object) => ({
      ...object,
      maxHp: object.hp,
      solid: true,
      pendingDestroy: false,
    })),
  };
}
export function collisionRects(state) {
  const def = getStateMap(state);
  if (simulationOptimizations.collisionSnapshots) return mapCollisionSnapshot(def, state);
  return [
    ...def.walls,
    ...(state.map?.objects || [])
      .filter((object) => object.solid)
      .map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
  ];
}
export function advanceMap(state) {
  const def = getStateMap(state);
  if (hasArenaPhysics(def)) {
    if (state.map?.ruleset !== ARENA_RULESET) throw Error('Unsupported map surface ruleset.');
    for (const controller of state.map.controllers) {
      const authored = def.controllers.find((c) => c.id === controller.id);
      controller.phase = (controller.phase + 1) % authored.period;
    }
  }
  for (const object of state.map?.objects || [])
    if (object.pendingDestroy) {
      object.solid = false;
      object.pendingDestroy = false;
      state.events?.push({
        type: 'coverbreak',
        id: object.id,
        x: object.x + object.w / 2,
        y: object.y + object.h / 2,
      });
    }
}
export function damageMapObject(state, id, amount) {
  const object = state.map?.objects.find((object) => object.id === id);
  if (!object?.solid || object.pendingDestroy || !(amount > 0) || !Number.isFinite(amount))
    return false;
  object.hp = Math.max(0, Math.round((object.hp - amount) * 256) / 256);
  if (object.hp === 0) object.pendingDestroy = true;
  return true;
}
export function surfaceMotion(state, p) {
  if (p.dashTicks > 0) return { x: 0, y: 0, walkScale: 1 };
  const def = getStateMap(state);
  if (hasArenaPhysics(def)) return { ...surfaceVelocity(def, p), walkScale: 1 };
  let x = 0,
    y = 0,
    walkScale = 1;
  for (const surface of def.surfaces)
    if (
      p.x >= surface.x &&
      p.x <= surface.x + surface.w &&
      p.y >= surface.y &&
      p.y <= surface.y + surface.h
    ) {
      x += surface.velocityX || 0;
      y += surface.velocityY || 0;
      walkScale = Math.min(walkScale, surface.walkScale || 1);
    }
  const magnitude = hypot(x, y),
    scale = magnitude > 2 ? 2 / magnitude : 1;
  return { x: x * scale, y: y * scale, walkScale };
}
export function chooseSpawn(state, index, deaths = 0) {
  const def = getStateMap(state),
    initial = def.spawnSets[state.players?.length || 2] || def.spawnSets[4],
    candidates =
      state.mode === 'simulation'
        ? [simulationSpawn(state, index, deaths), ...def.respawnCandidates]
        : deaths
          ? [
              ...def.respawnCandidates.slice((index + deaths) % def.respawnCandidates.length),
              ...def.respawnCandidates.slice(0, (index + deaths) % def.respawnCandidates.length),
            ]
          : [initial[index % initial.length], ...def.respawnCandidates];
  const entities = (state.entities || []).filter(
    (e) => !e.removed && (e.ttl === undefined || e.ttl > 0),
  );
  const rects = [
    ...collisionRects(state),
    ...def.hazards,
    ...entities.filter((e) => e.solid).map(solidRect),
  ];
  const circles = (state.players || [])
    .filter((p, i) => i !== index && !p.dead && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: p.x, y: p.y, radius: 19 }));
  return findSafeSpawn({
    candidates,
    ...survivalBounds(state, 13, def),
    radius: 13,
    rects,
    circles,
    blocked: (x, y) =>
      !floorSupports(def, x, y, 13) ||
      entities.some(
        (e) =>
          e.age >= e.arm &&
          ((e.force && square(x - e.x) + square(y - e.y) < square(e.force.radius + 13)) ||
            (e.geometries || [e.geometry]).some(
              (g) =>
                g &&
                (g.kind
                  ? staticShapeHit(g, e.x, e.y, e.angle || 0, x, y, 13, e.linkTo)
                  : overlaps(x, y, 13, {
                      x: e.x - (g.radius || 10),
                      y: e.y - (g.radius || 10),
                      w: (g.radius || 10) * 2,
                      h: (g.radius || 10) * 2,
                    })),
            )),
      ),
  });
}
