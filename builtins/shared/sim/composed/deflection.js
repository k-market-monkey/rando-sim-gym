// Any strike can turn projectiles away. A strike asks `deflectable` for each
// object it touches and calls `deflect`; the projectile then flies outward from
// the striker, belongs to them and has its full lifetime again. A projectile
// that was already deflected breaks instead, so it cannot be rallied forever.
import { direction } from './geometry.js';
import { compileMove } from './compiler.js';
import { count } from './runtime.js';
import { builtinAction } from './combat-identity.js';

const FREE_FLIGHT = ['linear', 'bounce'];

/**
 * Free-flying objects without health. Only the built-in shot opts in for now;
 * generated moves keep their pinned behavior until their content says so.
 */
export function deflectable(entity) {
  if (entity.removed || entity.maxHp > 0 || entity.solid || entity.anchorIds) return false;
  const template = compileMove(entity.move).templates[entity.templateId];
  return FREE_FLIGHT.includes(template.motion.kind) && builtinAction(entity.move) === 'shoot';
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
  entity.angle = direction(entity.x - striker.x, entity.y - striker.y);
  entity.baseAngle = entity.angle;
  entity.owner = striker.id;
  entity.ownerLife = striker.life;
  entity.life = striker.life;
  entity.ttl = entity.lifetime;
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
