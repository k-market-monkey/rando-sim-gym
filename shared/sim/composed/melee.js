// A built-in action: no generated slot, resource, reservation or tuning path.
import { direction, dir, blockedSegment, unit } from './geometry.js';
import { square } from '../exact-math.js';
import { componentWalls } from './mechanics.js';
import { damagePlayer, damageEntity, count } from './runtime.js';
import { MELEE_MOVE, MELEE_KEY } from './combat-identity.js';

export const MELEE = Object.freeze({
  windup: 2,
  recovery: 4,
  cooldown: 14,
  range: 64,
  damage: 20,
  shieldDamage: 25,
  impulse: 4,
});

export function resetMelee(player) {
  player.meleeCooldown = 0;
  player.meleeRecovery = 0;
  player.meleeAttack = null;
}
export function tickMelee(player) {
  player.meleeCooldown = Math.max(0, player.meleeCooldown - 1);
  player.meleeRecovery = Math.max(0, player.meleeRecovery - 1);
  if (player.meleeAttack) player.meleeAttack.remaining--;
}
export function meleeReady(state, player) {
  return (
    state.meleeEnabled &&
    !player.dead &&
    !player.shielding &&
    !player.shieldRelease &&
    !player.dashTicks &&
    !player.attack &&
    player.channel == null &&
    !player.meleeAttack &&
    !player.meleeCooldown &&
    !player.meleeRecovery &&
    !Object.values(player.moveResources).some((resource) => resource.recovery > 0)
  );
}
export function processMelee(state, player, input, generatedCommitted) {
  if (!input.melee || input.cancelAttack || generatedCommitted || !meleeReady(state, player))
    return;
  player.meleeCooldown = MELEE.cooldown;
  player.meleeAttack = {
    remaining: MELEE.windup,
    direction: direction(player.aimX - player.x, player.aimY - player.y),
  };
  count(state, 'activations', MELEE_MOVE);
  const event = { playerId: player.id, x: player.x, y: player.y, moveKey: MELEE_KEY };
  state.events.push({ type: 'melee-commit', ...event });
  state.events.push({ type: 'cast', ...event, move: MELEE_MOVE });
}
export function meleeContact(attacker, target, angle, walls) {
  const x = target.x - attacker.x,
    y = target.y - attacker.y,
    [dx, dy] = dir(angle),
    along = x * dx + y * dy,
    across = -x * dy + y * dx;
  return (
    square(x) + square(y) <= square(MELEE.range) &&
    along >= Math.abs(across) &&
    !blockedSegment(attacker.x, attacker.y, target.x, target.y, walls)
  );
}
/** Existing generated effects have already resolved; dead attackers cannot strike. */
export function resolveMelee(state) {
  const walls = componentWalls(state);
  for (const player of state.players) {
    if (player.dead || !player.meleeAttack || player.meleeAttack.remaining > 0) continue;
    const angle = player.meleeAttack.direction;
    player.meleeAttack = null;
    player.meleeRecovery = MELEE.recovery;
    state.events.push({
      type: 'melee-contact',
      playerId: player.id,
      x: player.x,
      y: player.y,
      moveKey: MELEE_KEY,
    });
    for (const target of state.entities) {
      if (
        target.removed ||
        target.maxHp <= 0 ||
        target.owner === player.id ||
        !meleeContact(
          player,
          target,
          angle,
          walls.filter((wall) => wall.entityId !== target.id),
        )
      )
        continue;
      damageEntity(state, target, MELEE.damage, player.id, MELEE_MOVE);
    }
    for (const target of state.players) {
      if (target === player || target.dead || !meleeContact(player, target, angle, walls)) continue;
      const [dx, dy] = unit(target.x - player.x, target.y - player.y);
      damagePlayer(
        state,
        target,
        MELEE.damage,
        dx,
        dy,
        MELEE.impulse,
        player.id,
        MELEE_MOVE,
        'impact',
        MELEE.shieldDamage,
      );
    }
  }
}
