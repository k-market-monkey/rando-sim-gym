import { projectileDir, projectileDirection, usesProjectileHeading } from './projectile-heading.js';
// Any strike can turn projectiles away. A strike asks `deflectable` for each
// object it touches and calls `deflect`; the projectile then flies outward from
// the striker, belongs to them and has its full lifetime again. A homing
// projectile stops steering and flies straight; a big one comes back slower.
// A projectile that was already deflected breaks instead, so it cannot be
// rallied forever. A deflecting hit never damages the projectile; health only
// matters to other attacks. A template opts out with `deflectable: false`.
import { direction, clamp, q } from './geometry.js';
import { compileMove } from './compiler.js';
import { count } from './runtime.js';

const FREE_FLIGHT = ['linear', 'bounce'];
/** Bigger projectiles come back slower: full speed up to `fullSpeedRadius`,
 * then `slowPerRadius` less per unit of radius, never below `minSpeedScale`. */
export const DEFLECT = Object.freeze({
  fullSpeedRadius: 4,
  slowPerRadius: 0.035,
  minSpeedScale: 0.3,
});

/** The share of its speed a projectile of this radius keeps when deflected. */
export const deflectSpeedScale = (radius) =>
  clamp(1 - (radius - DEFLECT.fullSpeedRadius) * DEFLECT.slowPerRadius, DEFLECT.minSpeedScale, 1);

/** Any free-flying object, built-in or generated, unless its template opts out. */
export function deflectable(entity) {
  if (entity.removed || entity.solid || entity.anchorIds) return false;
  const template = compileMove(entity.move).templates[entity.templateId];
  return FREE_FLIGHT.includes(template.motion.kind) && template.deflectable !== false;
}

/** Sends the projectile away from the striker along the line between them,
 * or breaks it if it was deflected before. */
export function deflect(state, entity, striker, strikeMove) {
  if (entity.deflected) {
    entity.removed = true;
    entity.ttl = 0;
    count(state, 'shotBreaks', strikeMove);
    state.events.push({
      type: 'shot-break',
      playerId: striker.id,
      x: entity.x,
      y: entity.y,
      moveKey: entity.moveKey,
    });
    return;
  }
  entity.deflected = true;
  entity.angle = (usesProjectileHeading(entity) ? projectileDirection : direction)(
    entity.x - striker.x,
    entity.y - striker.y,
  );
  entity.baseAngle = entity.angle;
  entity.owner = striker.id;
  entity.ownerLife = striker.life;
  entity.life = striker.life;
  entity.ttl = entity.lifetime;
  entity.target = null;
  entity.speed = q(entity.speed * deflectSpeedScale(entity.physicalRadius));
  count(state, 'deflections', strikeMove);
  state.events.push({
    type: 'deflect',
    playerId: striker.id,
    x: entity.x,
    y: entity.y,
    direction: entity.angle,
    moveKey: entity.moveKey,
  });
}
