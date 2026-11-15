// Bounded, current-state tactics. No stat modifiers, prediction cache or search tree.
import { shieldReady } from './shield.js';
import { builtinParry } from './bot-builtins.js';
import { compileMove } from './compiler.js';
import { enemyTargets } from './mechanics.js';
import { previewPlacement } from './runtime.js';
import { selfDamageEnabled } from './self-damage.js';
import { allWalls, circling } from './queries.js';
import { blockedSegment, clamp, dir, direction, hitEntity } from './geometry.js';
import { getStateMap } from '../map-state.js';
import { legalFighterPosition } from '../arena-physics.js';
import { hypot, square } from '../exact-math.js';
import { itemPace } from './items.js';
import { teleportAim } from './teleport-aim.js';
import { commits, noticed, tactical } from './bot-skill.js';

/** How far a lob's landing spawns reach: the widest shape its terminal events place. */
function lobBlast(move, template) {
  const templates = compileMove(move).templates;
  let reach = 0;
  for (const binding of template.events)
    if (binding.when === 'terminal')
      for (const action of binding.actions)
        if (action.op === 'spawn')
          for (const g of templates[action.template].geometry)
            reach = Math.max(reach, g.radius || 0, g.length || 0);
  return reach;
}
export function closestEnemy(state, player) {
  return enemyTargets(state, player)
    .filter(
      (target) =>
        !target.dead &&
        target.id !== player.id &&
        (!state.teamBattle || target.team !== player.team),
    )
    .sort(
      (a, b) =>
        square(a.x - player.x) +
        square(a.y - player.y) -
        square(b.x - player.x) -
        square(b.y - player.y),
    )[0];
}

/** Legal ready casts: usable teleports first, then preferred distance and slot. */
export function readyCombatPlans(state, player, target) {
  if (!target) return [];
  const distance = hypot(target.x - player.x, target.y - player.y),
    walls = allWalls(state);
  return player.loadout
    .map((move, slot) => ({
      move,
      slot,
      plan: compileMove(move),
      resource: player.moveResources[move.name],
    }))
    .filter(
      ({ move, plan, resource }) =>
        resource.cooldown === 0 &&
        resource.recovery === 0 &&
        resource.reload === 0 &&
        !resource.overheated &&
        resource.sequence !== 2 &&
        (!['charges', 'magazine'].includes(move.resource.kind) || resource.ammo > 0) &&
        (tactical(state) && move.casterAction.kind === 'teleport'
          ? teleportReady(state, player, move, target)
          : (resource.sequence === 1 ||
              distance <
                Math.max(plan.affordances.range + 13, plan.affordances.preferredDistance + 40)) &&
            (plan.affordances.setup === 'pair' ||
              !blockedSegment(player.x, player.y, target.x, target.y, walls)) &&
            previewPlacement(state, player, move, target.x, target.y)),
    )
    .sort(
      (a, b) =>
        (tactical(state)
          ? Number(b.move.casterAction.kind === 'teleport') -
            Number(a.move.casterAction.kind === 'teleport')
          : 0) ||
        Math.abs(distance - a.plan.affordances.preferredDistance) -
          Math.abs(distance - b.plan.affordances.preferredDistance) ||
        a.slot - b.slot,
    );
}

function teleportReady(state, player, move, target) {
  const aim = teleportAim(state, player, move, target);
  return aim && hypot(aim.x - player.x, aim.y - player.y) > 70;
}

export function hardMoveSlot(state, player) {
  return readyCombatPlans(state, player, closestEnemy(state, player))[0]?.slot;
}

const DIRECTIONS = [[0, 0], ...Array.from({ length: 8 }, (_, index) => dir(index * 4))];
/** Sample at most the engine's 96 effects and at most eight directions plus standing. */
export function hardDefense(state, player, original) {
  const input = { ...original, shield: false, dash: false },
    map = getStateMap(state),
    walls = [...allWalls(state), ...map.hazards],
    pace = ((state.speedPercent ?? 100) / 100) * itemPace(player),
    walk = 4.5 * pace,
    desired =
      input.x || input.y
        ? dir(Math.round(direction(clamp(input.x || 0, -1, 1), clamp(input.y || 0, -1, 1)) / 4) * 4)
        : [0, 0],
    threats = state.entities
      .slice(0, 96)
      .sort((a, b) => a.id - b.id)
      .filter((entity) => {
        if (entity.removed || entity.ttl <= 0 || entity.arm - entity.age > 3) return false;
        if (!noticed(state, player, entity)) return false;
        const owner = state.players.find((candidate) => candidate.id === entity.owner);
        if (
          entity.owner === player.id
            ? !selfDamageEnabled(entity.move, state)
            : state.teamBattle && owner?.team === player.team
        )
          return false;
        const template = compileMove(entity.move).templates[entity.templateId];
        if (template.motion.kind === 'lob' && lobBlast(entity.move, template) > 0) return true;
        return template.damage.amount > 0 || template.damage.shield > 0 || template.impulse > 0;
      }),
    legal = (vector, speed) =>
      [1, 2, 3].every((tick) =>
        legalFighterPosition(
          map,
          walls,
          player.x + vector[0] * speed * tick,
          player.y + vector[1] * speed * tick,
        ),
      ),
    // Each threat's three projected poses do not depend on the direction tried.
    projections = threats.map((entity) => {
      const template = compileMove(entity.move).templates[entity.templateId],
        pose = (x, y, previousX, previousY) => ({
          geometries: entity.geometries,
          linkTo: entity.linkTo,
          angle: entity.angle,
          previousAngle: entity.angle,
          previousX,
          previousY,
          x,
          y,
        });
      if (template.motion.kind === 'lob') {
        // A lob is harmless until it lands at its marked point.
        const at = pose(entity.toX, entity.toY, entity.toX, entity.toY);
        return {
          poses: [at, at, at],
          landing: entity.flight - (entity.age - entity.arm),
          radius: 13 + lobBlast(entity.move, template),
        };
      }
      const [dx, dy] = dir(entity.angle),
        travel = ['linear', 'bounce', 'return_to_owner'].includes(template.motion.kind)
          ? entity.speed
          : 0;
      return {
        poses: [1, 2, 3].map((tick) =>
          pose(
            entity.x + dx * travel * tick,
            entity.y + dy * travel * tick,
            entity.x + dx * travel * (tick - 1),
            entity.y + dy * travel * (tick - 1),
          ),
        ),
        landing: 0,
        radius: 13,
      };
    }),
    danger = (vector, speed) => {
      let total = 0;
      for (const { poses, landing, radius } of projections)
        for (let tick = 1; tick <= 3; tick++)
          if (
            tick >= landing &&
            hitEntity(
              poses[tick - 1],
              { x: player.x + vector[0] * speed * tick, y: player.y + vector[1] * speed * tick },
              radius,
            )
          ) {
            total++;
            break;
          }
      return total;
    },
    directions = DIRECTIONS;
  const parry = builtinParry(
    state,
    player,
    input,
    threats.filter((entity) => commits(state, player, 'parry', entity.id)),
  );
  if (parry) return parry;
  input.x = desired[0];
  input.y = desired[1];
  if (legal(desired, walk) && danger(desired, walk) === 0) return input;
  const choices = directions
    .map((vector, index) => ({ vector, index, legal: legal(vector, walk) }))
    .filter((choice) => choice.legal)
    .map((choice) => ({ ...choice, risk: danger(choice.vector, walk) }))
    .sort(
      (a, b) =>
        a.risk - b.risk ||
        square(a.vector[0] - desired[0]) +
          square(a.vector[1] - desired[1]) -
          square(b.vector[0] - desired[0]) -
          square(b.vector[1] - desired[1]) ||
        a.index - b.index,
    );
  const best = choices[0];
  if (best?.risk === 0) return { ...input, x: best.vector[0], y: best.vector[1] };
  if (shieldReady(state, player) && player.shield > 30 && commits(state, player, 'shield'))
    return { ...input, x: best?.vector[0] || 0, y: best?.vector[1] || 0, shield: true };
  if (
    state.dashEnabled !== false &&
    !player.dashCooldown &&
    !player.shieldRelease &&
    !player.shielding &&
    !circling(state, player.id) &&
    commits(state, player, 'dash')
  ) {
    const escape = directions
      .slice(1)
      .find((vector) => legal(vector, 14 * pace) && danger(vector, 14 * pace) === 0);
    if (escape) return { ...input, x: escape[0], y: escape[1], dash: true };
  }
  return { ...input, x: best?.vector[0] || 0, y: best?.vector[1] || 0 };
}
