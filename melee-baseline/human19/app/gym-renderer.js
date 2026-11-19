import { renderArena as renderBase } from './gym-base-renderer.js';
import { SHIELD } from '../shared/sim/composed/shield.js';
import { PLAYER_BODY_RADIUS } from './gym-collision.js';
import { drawHitCircle } from './hit-overlay.js';
export { receiveEffects } from './gym-base-renderer.js';

/** Read actual simulation timers, so pause and game speed cannot desync the cue. */
export function shieldVisualState(player, state = {}) {
  if (player.dead) return { label: 'Out', remaining: 0, total: 1, blocked: true };
  if (player.shielding)
    return {
      label: player.shieldPerfect > 0 ? `Parry active · ${player.shieldPerfect}f` : 'Shield up',
      remaining: 0,
      total: 1,
      blocked: false,
    };
  const recovery = Math.max(
    player.swipeRecovery || 0,
    ...Object.values(player.moveResources || {}).map((r) => r.recovery || 0),
  );
  const refill = player.shieldLocked ? Math.ceil((100 - player.shield) / SHIELD.recharge) : 0;
  const remaining = Math.max(player.shieldCooldown || 0, player.dashTicks || 0, recovery, refill);
  const reason = player.shieldLocked
    ? 'Shield refilling'
    : recovery > 0
      ? 'Shield blocked · attack recovery'
      : player.dashTicks > 0
        ? 'Shield blocked · dashing'
        : 'Shield cooldown';
  return {
    label:
      remaining > 0
        ? `${reason} · ${remaining}f (${(remaining / 30).toFixed(2)}s)`
        : 'Shield ready',
    remaining,
    total: Math.max(
      player.shieldLocked
        ? Math.ceil(100 / SHIELD.recharge)
        : (state.shieldRearmFrames ?? SHIELD.cooldown),
      remaining,
    ),
    blocked: remaining > 0 || player.shieldLocked,
    color: player.shieldLocked ? '#ff7373' : '#f2c56b',
  };
}
export function renderArena(canvas, state, options = {}) {
  // Retain the original lowering animation through the full shield cooldown.
  const visualState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      loweringDuration: Math.max(
        state.shieldReleaseFrames ?? SHIELD.release,
        state.shieldRearmFrames ?? SHIELD.cooldown,
      ),
      shieldRelease: Math.max(p.shieldRelease || 0, p.shieldCooldown || 0),
    })),
  };
  renderBase(canvas, visualState, options);
  const ctx = canvas.getContext('2d');
  for (const player of state.players) {
    if (player.dead) continue;
    if (options.showHitboxes)
      drawHitCircle(ctx, player.x, player.y, player.hitRadius ?? PLAYER_BODY_RADIUS);
  }
}
