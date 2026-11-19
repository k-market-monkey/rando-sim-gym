import { projectileDir, projectileDirection, usesProjectileHeading } from './projectile-heading.js';
// What the runtime does for the features a move can switch on: teleport,
// homing, reflected ray, companion and decoy, and the traced path of every beam.
//
// The runtime calls these at fixed points. A function that answers a question
// (placement, hitPlayer, hitObject, hitMap, queryReach, objectEligible) returns
// undefined when the template uses none of the features, and the runtime then
// applies its ordinary rule. `api` is the runtime's { basePlacement, player,
// count, remove }.
import { compileMove } from './compiler.js';
import {
  componentWalls,
  teleportDestination,
  traceRay,
  isBeam,
  enemyTargets,
  nearestTarget,
  rayHits,
} from './mechanics.js';
import { getStateMap } from '../map-state.js';
import {
  routeOnFloor,
  moveOnFloor,
  legalFighterPosition,
  surfaceVelocity,
} from '../arena-physics.js';
import {
  q,
  clamp,
  direction,
  unit,
  segmentRect,
  solidRect,
  beamMaxWidth,
  extendedLength,
} from './geometry.js';
import { relationDamageScale } from '../teams.js';
import { survivalBounds } from '../survival.js';
import { hypot, square } from '../exact-math.js';

const reference = (target) =>
  target
    ? { kind: target.actorId !== undefined ? 'entity' : 'player', id: target.actorId ?? target.id }
    : null;
const findTarget = (state, owner, ref) =>
  ref
    ? enemyTargets(state, owner).find((target) =>
        ref.kind === 'entity'
          ? target.actorId === ref.id
          : target.actorId === undefined && target.id === ref.id,
      ) || null
    : null;
function updateActor(state, entity, template, owner, api) {
  if (template.actor.kind === 'decoy') return;
  const map = getStateMap(state),
    walls = componentWalls(state),
    leash = template.actor.leash;
  let target = findTarget(state, owner, entity.target);
  if (!target || entity.age % 6 === 0) target = nearestTarget(state, owner, entity, leash);
  if (target && hypot(target.x - owner.x, target.y - owner.y) > leash) target = null;
  if (hypot(entity.x - owner.x, entity.y - owner.y) > leash) target = null;
  entity.target = reference(target);
  const goal = target || owner,
    distance = hypot(goal.x - entity.x, goal.y - entity.y),
    stop = target
      ? template.geometry[0].radius + (target.hitRadius ?? target.physicalRadius ?? 13) - 2
      : 30;
  let dx = 0,
    dy = 0;
  if (distance > stop) {
    const path = routeOnFloor(map, walls, entity, goal);
    let waypoint = goal;
    if (path.length)
      waypoint = {
        x: path[
          hypot(path[0][0] - entity.x, path[0][1] - entity.y) > 24
            ? 0
            : Math.min(1, path.length - 1)
        ][0],
        y: path[
          hypot(path[0][0] - entity.x, path[0][1] - entity.y) > 24
            ? 0
            : Math.min(1, path.length - 1)
        ][1],
      };
    [dx, dy] = unit(waypoint.x - entity.x, waypoint.y - entity.y);
    entity.angle = direction(dx, dy);
  }
  const transport = surfaceVelocity(map, { x: entity.x, y: entity.y, dashTicks: 0 }),
    beforeX = entity.x,
    beforeY = entity.y;
  moveOnFloor(
    map,
    walls,
    entity,
    dx * template.actor.speed + transport.x,
    dy * template.actor.speed + transport.y,
  );
  if (entity.x !== beforeX || entity.y !== beforeY) api.count(state, 'companionSteps', entity.move);
  const bounds = survivalBounds(state);
  if (
    state.ring &&
    (entity.x < bounds.minX ||
      entity.x > bounds.maxX ||
      entity.y < bounds.minY ||
      entity.y > bounds.maxY) &&
    state.tick % 15 === 0
  ) {
    entity.hp = Math.max(0, entity.hp - 20);
    if (!entity.hp) api.remove(entity);
  }
}
/** Whether the owner may cast this plan: a fighter keeps at most two actors alive. */
export function actorSlotsFree(state, owner, plan) {
  return (
    !plan.actorSlots ||
    state.reservations
      .filter((r) => r.owner === owner.id)
      .reduce((sum, r) => sum + (r.actorSlots || 0), 0) +
      plan.actorSlots <=
      2
  );
}
/** Where a teleport, actor or reflected ray is placed; null when it cannot be. */
export function placement(state, player, template, aimX, aimY, policy, api) {
  if (template.casterAction.kind === 'teleport') {
    const destination = teleportDestination(
      state,
      player,
      { casterAction: template.casterAction },
      aimX,
      aimY,
    );
    if (!destination) return null;
    const virtual = { ...player, ...destination },
      pose = api.basePlacement(state, virtual, template, aimX, aimY, policy);
    return pose ? { ...pose, teleport: destination } : null;
  }
  if (template.actor.kind !== 'none' || template.ray.kind === 'reflect') {
    const pose = api.basePlacement(state, player, template, aimX, aimY, policy);
    if (!pose) return null;
    if (
      template.actor.kind !== 'none' &&
      !legalFighterPosition(getStateMap(state), componentWalls(state), pose.x, pose.y)
    )
      return null;
    if (
      template.ray.kind === 'reflect' &&
      !traceRay(
        state,
        pose.x,
        pose.y,
        pose.angle,
        template.ray.range,
        template.ray.bounces,
        template.geometry[0].width,
      ).length
    )
      return null;
    return pose;
  }
}
/**
 * Where a lunge ends: toward the aim by at most its range, stopping short of
 * the aim so the strike still faces it. Undefined for other moves.
 */
export function lungeEnd(player, move, aimX, aimY) {
  if (move.casterAction?.kind !== 'lunge' || ![aimX, aimY].every(Number.isFinite)) return;
  const dx = aimX - player.x,
    dy = aimY - player.y,
    distance = hypot(dx, dy),
    travel = clamp(distance - LUNGE_STANDOFF, 0, move.casterAction.range),
    scale = distance ? travel / distance : 0;
  return { lungeX: q(player.x + dx * scale), lungeY: q(player.y + dy * scale) };
}
const LUNGE_STANDOFF = 24;
/**
 * One windup tick of a lunge: the caster covers an even share of the way left,
 * in short steps, and stops for good at a wall, a gap, the arena edge or
 * another fighter.
 */
export function lungeStep(state, player, attack) {
  if (attack.lungeX === undefined) return;
  const dx = (attack.lungeX - player.x) / Math.max(1, attack.remaining),
    dy = (attack.lungeY - player.y) / Math.max(1, attack.remaining),
    steps = Math.ceil(hypot(dx, dy) / 4),
    startX = player.x,
    startY = player.y,
    map = getStateMap(state),
    walls = componentWalls(state),
    bounds = survivalBounds(state, 13);
  for (let i = 1; i <= steps; i++) {
    const x = q(startX + (dx * i) / steps),
      y = q(startY + (dy * i) / steps);
    if (
      x < bounds.minX ||
      x > bounds.maxX ||
      y < bounds.minY ||
      y > bounds.maxY ||
      !legalFighterPosition(map, walls, x, y) ||
      state.players.some(
        (other) =>
          other !== player && !other.dead && square(other.x - x) + square(other.y - y) < 26 * 26,
      )
    ) {
      attack.lungeX = player.x;
      attack.lungeY = player.y;
      return;
    }
    player.x = x;
    player.y = y;
  }
}
/** Moves the caster to the destination chosen when the move was placed. */
export function teleportCaster(state, player, move, destination, api) {
  const fromX = player.x,
    fromY = player.y;
  Object.assign(player, destination, { vx: 0, vy: 0, fieldX: 0, fieldY: 0 });
  if ('walkMomentumX' in player)
    Object.assign(player, {
      walkMomentumX: 0,
      walkMomentumY: 0,
      surfaceGrip: null,
      dashResidual: false,
    });
  api.count(state, 'teleports', move);
  state.events.push({
    type: 'teleport',
    playerId: player.id,
    fromX,
    fromY,
    x: player.x,
    y: player.y,
    color: move.coreColor,
  });
}
export function initializeEntity(state, entity, owner, template, api) {
  if (template.actor.kind !== 'none') {
    entity.actor = {
      kind: template.actor.kind,
      appearance: {
        name: owner.name,
        color: owner.color,
        secondaryColor: owner.secondaryColor,
        look: owner.look,
        team: owner.team,
      },
    };
    entity.target = null;
    api.count(
      state,
      template.actor.kind === 'companion' ? 'companionsSpawned' : 'decoysSpawned',
      entity.move,
    );
  }
  if (template.guidance.kind === 'homing') {
    entity.target = null;
    api.count(state, 'guidedProjectiles', entity.move);
  }
  if (isBeam(template)) {
    entity.raySegments = beamPath(state, entity, template);
    if (template.ray.kind === 'reflect') api.count(state, 'reflectedRays', entity.move);
  }
}
/**
 * The path a beam takes now. A reflected ray turns at walls; a free or linked
 * segment stops at the first wall. Any of them turns at a beam reflector.
 */
function beamPath(state, entity, template) {
  const g = template.geometry[0],
    { width } = g,
    // An extending beam reaches its full length `extend` ticks after spawn.
    length = extendedLength(g, beamLength(template), entity.age);
  if (template.ray.kind === 'reflect')
    return traceRay(state, entity.x, entity.y, entity.angle, length, template.ray.bounces, width);
  if (entity.linkTo)
    return traceRay(
      state,
      entity.x,
      entity.y,
      entity.angle,
      hypot(entity.linkTo.x - entity.x, entity.linkTo.y - entity.y),
      0,
      width,
      entity.linkTo,
    );
  return traceRay(state, entity.x, entity.y, entity.angle, length, 0, width);
}
/** A beam follows the walls and reflectors as they are now, every tick it lives. */
/** A free beam's full length: its reflected range or its segment length. */
const beamLength = (template) =>
  template.ray.kind === 'reflect' ? template.ray.range : template.geometry[0].length;
export function effectFrame(state, entity, template) {
  if (isBeam(template)) entity.raySegments = beamPath(state, entity, template);
}
/** Moves an actor, holds a ray still or steers a homing object. True when nothing else may move it. */
export function motion(state, entity, template, owner, api) {
  if (template.actor.kind !== 'none') {
    updateActor(state, entity, template, owner, api);
    return true;
  }
  if (template.ray.kind === 'reflect') return true;
  if (template.guidance.kind === 'homing' && !entity.deflected) {
    let target = findTarget(state, owner, entity.target);
    if (!target || entity.age % template.guidance.retargetEvery === 0)
      target = nearestTarget(state, owner, entity, template.guidance.acquireRadius);
    entity.target = reference(target);
    if (target) {
      const wanted = (usesProjectileHeading(template) ? projectileDirection : direction)(
          target.x - entity.x,
          target.y - entity.y,
        ),
        turn = ((((wanted - entity.angle) % 32) + 48) % 32) - 16,
        change = clamp(turn, -template.guidance.turnRate, template.guidance.turnRate);
      entity.angle += change;
      if (change) api.count(state, 'homingTurns', entity.move);
    }
  }
  return false;
}
/** Actors take damage by the same team and self-damage rules as their owner. */
export function objectEligible(state, entity, target, api) {
  if (target.actor)
    return (
      relationDamageScale(
        entity.move,
        api.player(state, entity.owner),
        api.player(state, target.owner),
        state,
      ) > 0
    );
}
export function queryReach(entity) {
  if (!entity.raySegments) return;
  const template = compileMove(entity.move).templates[entity.templateId];
  const extra = 32 + (beamMaxWidth(template.geometry[0]) - template.geometry[0].width) / 2;
  if (entity.linkTo) return hypot(entity.linkTo.x - entity.x, entity.linkTo.y - entity.y) + 32;
  return beamLength(template) + extra;
}
const fullLength = (entity) =>
  entity.linkTo ? 0 : beamLength(compileMove(entity.move).templates[entity.templateId]);
export function hitPlayer(state, entity, player) {
  if (entity.raySegments)
    return rayHits(state, entity, player, player.hitRadius, null, fullLength(entity));
}
export function hitObject(state, entity, target) {
  if (!entity.raySegments) return;
  // A beam turns at a reflector instead of damaging it.
  if (compileMove(target.move).templates[target.templateId].reflectsBeams) return false;
  if (target.solid)
    return entity.raySegments.some(
      (segment) =>
        segment.entityId === target.id ||
        segmentRect(
          segment.x,
          segment.y,
          segment.endX,
          segment.endY,
          solidRect(target),
          beamMaxWidth(entity.geometry) / 2,
        ),
    );
  return rayHits(state, entity, target, target.physicalRadius, target.id, fullLength(entity));
}
export function hitMap(entity, rect) {
  if (entity.raySegments)
    return entity.raySegments.some((segment) => segment.objectId === rect.objectId);
}
