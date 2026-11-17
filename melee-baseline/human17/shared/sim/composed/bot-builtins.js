import { projectileDir, usesProjectileHeading } from './projectile-heading.js';
// Built-in fallback tactics. Generated moves keep priority; no extra stats or resources.
import { compileMove } from './compiler.js';
import { SHOOT_MOVE } from './combat-identity.js';
import { shootReady } from './shoot.js';
import { swipeReady, swipeContact, SWIPE } from './swipe.js';
import { blockedSegment, direction, dir, hitEntity } from './geometry.js';
import { deflectable } from './deflection.js';
import { previewPlacement } from './runtime.js';
import { allWalls } from './queries.js';
import { hypot } from '../exact-math.js';
import { tactical } from './bot-skill.js';

export const builtinsAvailable = (state) =>
  state.shootEnabled === true || state.swipeEnabled === true;
export function generatedReady(player, move) {
  const r = player.moveResources[move.name];
  return (
    r &&
    !r.cooldown &&
    !r.recovery &&
    !r.reload &&
    !r.overheated &&
    r.sequence !== 2 &&
    (!['charges', 'magazine'].includes(move.resource.kind) || r.ammo > 0)
  );
}
function attackBusy(player) {
  return (
    player.attack ||
    player.channel != null ||
    player.pendingAttack ||
    player.swipeAttack ||
    player.swipeRecovery > 0 ||
    Object.values(player.moveResources).some((r) => r.recovery > 0)
  );
}
/** Movement hint only; built-in attacks never become generated loadout slots. */
export function builtinMovement(state, player, plans) {
  if (
    !builtinsAvailable(state) ||
    attackBusy(player) ||
    plans.some(({ m }) => generatedReady(player, m))
  )
    return null;
  const compiled = compileMove(SHOOT_MOVE),
    close = !state.shootEnabled || player.shootOverheated,
    plan = close
      ? {
          ...compiled,
          affordances: {
            ...compiled.affordances,
            range: SWIPE.range,
            preferredDistance: SWIPE.range - 12,
          },
        }
      : compiled;
  return { m: SHOOT_MOVE, i: -1, plan, r: { sequence: 0, cooldown: 0, recovery: 0 } };
}
/** Choose a single attack. Never steal generated windup, hold or queued continuation. */
export function builtinOffense(state, player, target, original) {
  if (
    !builtinsAvailable(state) ||
    !target ||
    original.swipe ||
    original.shoot ||
    original.shield ||
    original.dash ||
    attackBusy(player)
  )
    return original;
  const slots = [...(original.pressedSlots || []), ...(original.heldSlots || [])];
  if (slots.some((slot) => player.loadout[slot] && generatedReady(player, player.loadout[slot])))
    return original;
  const input = { ...original, pressedSlots: [], heldSlots: [] },
    walls = allWalls(state);
  if (
    swipeReady(state, player) &&
    swipeContact(player, target, direction(target.x - player.x, target.y - player.y), walls)
  )
    return { ...input, aimX: target.x, aimY: target.y, swipe: true };
  const plan = compileMove(SHOOT_MOVE);
  if (
    shootReady(state, player) &&
    hypot(target.x - player.x, target.y - player.y) <= plan.affordances.range &&
    !blockedSegment(player.x, player.y, target.x, target.y, walls) &&
    previewPlacement(state, player, SHOOT_MOVE, target.x, target.y)
  )
    return { ...input, aimX: target.x, aimY: target.y, shoot: true };
  return input;
}

/** A shot one swipe handles: it deflects, or it breaks in one hit (bees). */
const swipeAnswers = (effect) =>
  deflectable(effect) || (effect.speed > 0 && effect.maxHp > 0 && effect.hp <= SWIPE.damage);

/** A ready generated melee blade: a plain press whose root rides the caster and damages. */
function readyBlade(player) {
  for (const [slot, m] of player.loadout.entries()) {
    const root = m.templates.find((t) => t.id === m.root);
    if (
      m.activation.mode === 'press' &&
      m.casterAction.kind === 'none' &&
      m.setup.kind !== 'pair' &&
      root.motion.kind === 'caster_attached' &&
      root.damage.amount > 0 &&
      generatedReady(player, m)
    ) {
      const reach = Math.max(...root.geometry.map((g) => g.radius)) + root.motion.offset;
      return { slot, m, root, reach };
    }
  }
  return null;
}

/** Where the first hostile shot that a strike can meet will be after `horizon` ticks.
 * Resolve happens after projectile motion, including the commit tick. */
function interceptPoint(state, player, effects, horizon, answers, meets) {
  const walls = allWalls(state);
  for (const effect of effects.slice(0, 96)) {
    if (effect.owner === player.id || effect.age < effect.arm || !answers(effect)) continue;
    const owner = state.players.find((p) => p.id === effect.owner);
    if (state.teamBattle && owner?.team === player.team) continue;
    const [dx, dy] = (usesProjectileHeading(effect) ? projectileDir : dir)(effect.angle),
      end = {
        x: effect.x + dx * effect.speed * horizon,
        y: effect.y + dy * effect.speed * horizon,
      };
    if (blockedSegment(effect.x, effect.y, end.x, end.y, walls, effect.physicalRadius)) continue;
    // Already too late: a shot reaching the body before contact needs block/dodge.
    if (
      hitEntity(
        {
          ...effect,
          previousX: effect.x,
          previousY: effect.y,
          x: end.x,
          y: end.y,
          previousAngle: effect.angle,
        },
        player,
      )
    )
      continue;
    // Do not spend a parry on nearby shots travelling away or past the fighter.
    if (
      !hitEntity(
        {
          ...effect,
          previousX: end.x,
          previousY: end.y,
          x: end.x + dx * effect.speed * 3,
          y: end.y + dy * effect.speed * 3,
          previousAngle: effect.angle,
        },
        player,
      )
    )
      continue;
    if (meets(end, walls)) return end;
  }
  return null;
}

const parryInput = (original, aimX, aimY) => ({
  ...original,
  x: 0,
  y: 0,
  aimX,
  aimY,
  shield: false,
  dash: false,
  pressedSlots: [],
  heldSlots: [],
  swipe: false,
  shoot: false,
});

/** Intercept a hostile shot when Swipe, or else (hard bots) a ready generated melee blade, meets
 * it before it hits. A blade is aimed so its opening sweep frame faces the shot. */
export function builtinParry(state, player, original, effects = state.entities) {
  if (attackBusy(player)) return null;
  if (swipeReady(state, player)) {
    const end = interceptPoint(
      state,
      player,
      effects,
      SWIPE.windup + 1,
      swipeAnswers,
      (point, walls) =>
        swipeContact(player, point, direction(point.x - player.x, point.y - player.y), walls),
    );
    if (end) return { ...parryInput(original, end.x, end.y), swipe: true };
  }
  // Normal bots stay pinned to their frozen decisions; only tactical bots parry with blades.
  const blade = tactical(state) && readyBlade(player);
  if (!blade) return null;
  const answers = (effect) =>
      deflectable(effect) ||
      (effect.speed > 0 && effect.maxHp > 0 && effect.hp <= blade.root.damage.amount),
    end = interceptPoint(
      state,
      player,
      effects,
      // The blade spawns at commit and first strikes on the following tick.
      blade.m.activation.windup + 2,
      answers,
      (point, walls) =>
        hypot(point.x - player.x, point.y - player.y) <= blade.reach &&
        !blockedSegment(player.x, player.y, point.x, point.y, walls),
    );
  if (!end) return null;
  const [ax, ay] = dir(
    direction(end.x - player.x, end.y - player.y) + Math.round(blade.root.motion.sweep / 2),
  );
  return {
    ...parryInput(original, player.x + ax * 64, player.y + ay * 64),
    pressedSlots: [blade.slot],
  };
}
