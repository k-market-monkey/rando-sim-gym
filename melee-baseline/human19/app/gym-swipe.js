import { hitCenterY } from '../shared/sim/composed/hit-center.js';
// Playable gym fork of the pinned swipe; archived replays use the original.
import { circleTouchesSwipe, PLAYER_BODY_RADIUS } from './gym-collision.js';
// A built-in action: no generated slot, resource, reservation or tuning path.
import { direction, unit } from '../shared/sim/composed/geometry.js';

import { componentWalls } from '../shared/sim/composed/mechanics.js';
import { damagePlayer, damageEntity, count } from '../shared/sim/composed/runtime.js';
import { SWIPE_MOVE, SWIPE_KEY } from '../shared/sim/composed/combat-identity.js';
import { deflectable, deflect } from '../shared/sim/composed/deflection.js';

let swipeCooldownFrames = 14;
export function configureSwipeCooldown(frames) {
  swipeCooldownFrames = Math.max(0, Math.min(180, Math.round(frames)));
}
export const SWIPE = Object.freeze({
  windup: 2,
  recovery: 4,
  get cooldown() {
    return swipeCooldownFrames;
  },
  range: 64,
  damage: 20,
  shieldDamage: 25,
  impulse: 4,
});

export function resetSwipe(player) {
  player.swipeCooldown = 0;
  player.swipeRecovery = 0;
  player.swipeAttack = null;
}
export function tickSwipe(player) {
  player.swipeCooldown = Math.max(0, player.swipeCooldown - 1);
  player.swipeRecovery = Math.max(0, player.swipeRecovery - 1);
  if (player.swipeAttack) player.swipeAttack.remaining--;
}
export function swipeReady(state, player) {
  return (
    state.swipeEnabled &&
    !player.dead &&
    !player.shielding &&
    !player.shieldRelease &&
    !player.dashTicks &&
    !player.attack &&
    player.channel == null &&
    !player.swipeAttack &&
    !player.swipeCooldown &&
    !player.swipeRecovery &&
    !Object.values(player.moveResources).some((resource) => resource.recovery > 0)
  );
}
export function processSwipe(state, player, input, generatedCommitted) {
  if (!input.swipe || input.cancelAttack || generatedCommitted || !swipeReady(state, player))
    return;
  player.swipeCooldown = state.swipeCooldownFrames ?? SWIPE.cooldown;
  player.swipeAttack = {
    remaining: SWIPE.windup,
    direction: direction(player.aimX - player.x, player.aimY - player.y),
  };
  count(state, 'activations', SWIPE_MOVE);
  const event = { playerId: player.id, x: player.x, y: player.y, moveKey: SWIPE_KEY };
  state.events.push({ type: 'swipe-commit', ...event });
  state.events.push({ type: 'cast', ...event, move: SWIPE_MOVE });
}
export function swipeContact(
  attacker,
  target,
  angle,
  walls,
  radius = target.hitRadius ?? PLAYER_BODY_RADIUS,
) {
  const center = target.hitRadius === undefined ? target : { x: target.x, y: hitCenterY(target.y) };
  return circleTouchesSwipe(attacker, center, angle, SWIPE.range, radius, walls);
}
/** Existing generated effects have already resolved; dead attackers cannot strike. */
export function resolveSwipe(state) {
  const walls = componentWalls(state);
  // Swipes landing on the same tick strike together, so seat order cannot cancel a trade.
  const due = state.players
    .filter((player) => !player.dead && player.swipeAttack && player.swipeAttack.remaining <= 0)
    .map((player) => {
      const angle = player.swipeAttack.direction;
      player.swipeAttack = null;
      player.swipeRecovery = SWIPE.recovery;
      return { player, angle };
    });
  for (const { player, angle } of due) {
    state.events.push({
      type: 'swipe-contact',
      playerId: player.id,
      x: player.x,
      y: player.y,
      direction: angle,
      moveKey: SWIPE_KEY,
    });
    for (const target of state.entities) {
      if (
        target.removed ||
        target.owner === player.id ||
        !(target.maxHp > 0 || deflectable(target)) ||
        !swipeContact(
          player,
          target,
          angle,
          walls.filter((wall) => wall.entityId !== target.id),
          target.physicalRadius || 0,
        )
      )
        continue;
      // Deflectable shots are knocked away unharmed; other objects with health take damage.
      if (deflectable(target)) deflect(state, target, player, SWIPE_MOVE);
      else damageEntity(state, target, SWIPE.damage, player.id, SWIPE_MOVE);
    }
    for (const target of state.players) {
      if (target === player || target.dead || !swipeContact(player, target, angle, walls)) continue;
      const [dx, dy] = unit(target.x - player.x, target.y - player.y);
      damagePlayer(
        state,
        target,
        SWIPE.damage,
        dx,
        dy,
        SWIPE.impulse,
        player.id,
        SWIPE_MOVE,
        'impact',
        SWIPE.shieldDamage,
      );
    }
  }
}
