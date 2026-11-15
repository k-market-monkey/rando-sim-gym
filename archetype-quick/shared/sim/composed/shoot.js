// A built-in action: one light bullet per press on a fixed interval. Heat
// limits bursts; it has no generated slot, resource or tuning path.
import { q } from './geometry.js';
import { count, spawnBuiltin } from './runtime.js';
import { SHOOT_MOVE, SHOOT_KEY } from './combat-identity.js';

export const SHOOT = Object.freeze({
  // 2.5 shots per second at most.
  interval: 12,
  // About nine shots at the full rate overheat it; cooling to a quarter of
  // the threshold then takes a little over three seconds.
  heatPerShot: 20,
  cooling: 0.75,
  threshold: 100,
  recoverAt: 25,
  // A press this close to the next shot waits for it instead of being lost.
  buffer: 4,
});

export function resetShoot(player) {
  player.shootCooldown = 0;
  player.shootHeat = 0;
  player.shootOverheated = false;
  player.shootQueued = 0;
}
export function tickShoot(player) {
  player.shootCooldown = Math.max(0, player.shootCooldown - 1);
  player.shootQueued = Math.max(0, player.shootQueued - 1);
  player.shootHeat = q(Math.max(0, player.shootHeat - SHOOT.cooling));
  if (player.shootOverheated && player.shootHeat <= SHOOT.recoverAt) player.shootOverheated = false;
}
export function shootReady(state, player) {
  return (
    state.shootEnabled &&
    !player.dead &&
    !player.shielding &&
    !player.shieldRelease &&
    !player.dashTicks &&
    !player.attack &&
    player.channel == null &&
    !player.swipeAttack &&
    !player.shootCooldown &&
    !player.shootOverheated
  );
}
export function processShoot(state, player, input) {
  if (input.cancelAttack) player.shootQueued = 0;
  else if (input.shoot) player.shootQueued = SHOOT.buffer;
  if (!player.shootQueued || !shootReady(state, player)) return;
  player.shootQueued = 0;
  // A blocked muzzle spends nothing.
  if (!spawnBuiltin(state, player, SHOOT_MOVE)) return;
  player.shootCooldown = SHOOT.interval;
  player.shootHeat = q(Math.min(SHOOT.threshold, player.shootHeat + SHOOT.heatPerShot));
  count(state, 'activations', SHOOT_MOVE);
  const event = { playerId: player.id, x: player.x, y: player.y, moveKey: SHOOT_KEY };
  state.events.push({ type: 'cast', ...event, move: SHOOT_MOVE });
  if (player.shootHeat >= SHOOT.threshold) {
    player.shootOverheated = true;
    count(state, 'overheats', SHOOT_MOVE);
    state.events.push({ type: 'shoot-overheat', ...event });
  }
}
