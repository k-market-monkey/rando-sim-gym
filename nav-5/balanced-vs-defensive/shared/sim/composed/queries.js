// Shared read-only combat queries; independent of engine step ordering.
import { compileMove } from './compiler.js';
import { collisionRects } from '../map-state.js';
import { simulationOptimizations } from '../performance-options.js';
import { solidCollisionSnapshot } from '../collision-snapshots.js';
import { solidRect } from './geometry.js';
/** Whether the player owns a live object circling them; dash is locked while one does. */
export function circling(s, id) {
  return s.entities.some(
    (e) =>
      e.owner === id &&
      !e.removed &&
      compileMove(e.move).templates[e.templateId].motion.kind === 'orbit_owner',
  );
}

export function allWalls(s) {
  if (simulationOptimizations.collisionSnapshots)
    return solidCollisionSnapshot(s, collisionRects(s));
  return [...collisionRects(s), ...s.entities.filter((e) => e.solid && !e.removed).map(solidRect)];
}
