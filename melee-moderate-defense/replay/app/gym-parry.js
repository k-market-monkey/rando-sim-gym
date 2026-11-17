import { raiseShield as originalRaiseShield } from '../shared/sim/composed/shield.js';
export { resetShield, holdShield } from '../shared/sim/composed/shield.js';
let defaultWindow = 6;
export function configureParry(frames) {
  defaultWindow = frames;
}
export function defaultParryWindow() {
  return defaultWindow;
}
export function resetParries() {}
export function parryRemaining(state, player) {
  if (player.lastParryTick === null || player.lastParryLife !== player.life) return 0;
  return Math.max(0, player.lastParryTick + state.parryWindow - state.tick);
}
export function recordParries(state) {
  for (const p of state.players) if (p.dead) p.lastParryTick = null;
  for (const e of state.events)
    if (e.type === 'perfect-block') {
      const p = state.players.find((p) => p.id === e.playerId);
      if (p && !p.dead) {
        p.lastParryTick = state.tick;
        p.lastParryLife = p.life;
      }
    }
}
export function raiseShield(state, player, input) {
  const was = player.shielding;
  const earned =
    state.parryWindow > 0 &&
    player.lastParryTick !== null &&
    player.lastParryLife === player.life &&
    state.tick > player.lastParryTick &&
    state.tick <= player.lastParryTick + state.parryWindow;
  const recovering =
    player.swipeRecovery > 0 ||
    Object.values(player.moveResources || {}).some((r) => r.recovery > 0);
  const up = originalRaiseShield(
    state,
    player,
    !was && recovering ? { ...input, shield: false } : input,
  );
  if (was && !up) {
    player.lastParryTick = null;
    if (earned && !input.shield && !player.dead && !player.shieldLocked && player.shield > 0) {
      player.shieldRelease = 0;
      player.shieldCooldown = 0;
      state.events.push({ type: 'parry-release', playerId: player.id, x: player.x, y: player.y });
    }
  }
  return up;
}
