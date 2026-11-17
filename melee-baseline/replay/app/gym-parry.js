import { raiseShield as originalRaiseShield } from '../shared/sim/composed/shield.js';
export { resetShield, holdShield } from '../shared/sim/composed/shield.js';

// A successful perfect block earns one fast release, measured in simulation ticks.
const parries = new Map();
let windowFrames = 6;
export function configureParry(frames) {
  windowFrames = frames;
}
export function resetParries() {
  parries.clear();
}
export function parryRemaining(state, player) {
  const parry = parries.get(player.id);
  if (!parry || parry.life !== player.life || !windowFrames) return 0;
  return Math.max(0, parry.tick + windowFrames - state.tick);
}
export function recordParries(state) {
  for (const player of state.players) if (player.dead) parries.delete(player.id);
  for (const event of state.events) {
    if (event.type !== 'perfect-block') continue;
    const player = state.players.find((p) => p.id === event.playerId);
    if (player && !player.dead) parries.set(player.id, { tick: state.tick, life: player.life });
  }
}
export function raiseShield(state, player, input) {
  const wasShielding = player.shielding;
  const parry = parries.get(player.id);
  const canCounter =
    windowFrames > 0 &&
    parry?.life === player.life &&
    state.tick > parry.tick &&
    state.tick <= parry.tick + windowFrames;
  const shielding = originalRaiseShield(state, player, input);
  if (wasShielding && !shielding) {
    parries.delete(player.id);
    if (canCounter && !input.shield && !player.dead && !player.shieldLocked && player.shield > 0) {
      player.shieldRelease = 0;
      state.events.push({ type: 'parry-release', playerId: player.id, x: player.x, y: player.y });
    }
  }
  return shielding;
}
