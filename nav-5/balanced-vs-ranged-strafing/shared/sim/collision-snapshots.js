import { solidRect } from './composed/geometry.js';

// Derived, immutable geometry only. Weak keys never retain a completed match.
let mapSnapshots = new WeakMap(),
  entitySnapshots = new WeakMap(),
  decoratedSnapshots = new WeakMap();
export function resetCollisionCaches() {
  mapSnapshots = new WeakMap();
  entitySnapshots = new WeakMap();
  decoratedSnapshots = new WeakMap();
}

export function mapCollisionSnapshot(map, state) {
  const objects = state.map?.objects || [],
    previous = mapSnapshots.get(state);
  let offset = map.walls.length,
    unchanged = previous?.map === map;
  for (const object of objects)
    if (object.solid) {
      const saved = previous?.rects[offset];
      offset++;
      if (
        !saved ||
        saved.id !== object.id ||
        !Object.is(saved.x, object.x) ||
        !Object.is(saved.y, object.y) ||
        !Object.is(saved.w, object.w) ||
        !Object.is(saved.h, object.h)
      )
        unchanged = false;
    }
  if (unchanged && offset === previous.rects.length) return previous.rects;
  const rects =
    offset === map.walls.length
      ? map.walls
      : Object.freeze([
          ...map.walls,
          ...objects
            .filter((object) => object.solid)
            .map(({ id, x, y, w, h }) => Object.freeze({ id, x, y, w, h })),
        ]);
  mapSnapshots.set(state, { map, rects });
  return rects;
}

function attributedRects(rects) {
  let result = decoratedSnapshots.get(rects);
  if (!result) {
    result = Object.freeze(rects.map((w) => Object.freeze({ ...w, objectId: w.id })));
    decoratedSnapshots.set(rects, result);
  }
  return result;
}

/** Check each current solid on every call: casts/removals can change geometry
 * between two queries in one tick. Non-solid effects allocate no rectangles. */
export function solidCollisionSnapshot(state, mapRects, attributed = false) {
  const base = attributed ? attributedRects(mapRects) : mapRects,
    slot = attributed ? 'runtime' : 'movement',
    cached = entitySnapshots.get(state),
    previous = cached?.[slot];
  let count = 0,
    unchanged = previous?.base === base;
  for (const entity of state.entities)
    if (entity.solid && !entity.removed) {
      const { x, y, w, h } = solidRect(entity),
        saved = previous?.rects[base.length + count];
      count++;
      if (
        !saved ||
        (attributed && saved.entityId !== entity.id) ||
        !Object.is(saved.x, x) ||
        !Object.is(saved.y, y) ||
        !Object.is(saved.w, w) ||
        !Object.is(saved.h, h)
      )
        unchanged = false;
    }
  if (!count) return base;
  if (unchanged && previous.rects.length === base.length + count) return previous.rects;
  const rects = base.slice();
  for (const entity of state.entities)
    if (entity.solid && !entity.removed) {
      rects.push(
        Object.freeze({ ...(attributed ? { entityId: entity.id } : {}), ...solidRect(entity) }),
      );
    }
  const result = Object.freeze(rects);
  entitySnapshots.set(state, { ...cached, [slot]: { base, rects: result } });
  return result;
}
