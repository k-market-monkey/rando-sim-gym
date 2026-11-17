import { renderArena as renderBase } from './renderer.js';
import { SHIELD } from '../shared/sim/composed/shield.js';
import { PLAYER_BODY_RADIUS } from './gym-collision.js';
export { receiveEffects } from './renderer.js';

/** Read actual simulation timers, so pause and game speed cannot desync the cue. */
export function shieldVisualState(player) {
  if (player.dead) return { label: 'Respawning', remaining: 0, total: 1, blocked: true };
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
  const remaining = Math.max(
    player.shieldCooldown || 0,
    player.shieldRelease || 0,
    player.dashTicks || 0,
    recovery,
    refill,
  );
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
      player.shieldLocked ? Math.ceil(100 / SHIELD.recharge) : SHIELD.cooldown,
      remaining,
    ),
    blocked: remaining > 0 || player.shieldLocked,
    color: player.shieldLocked ? '#ff7373' : '#f2c56b',
  };
}
export function renderArena(canvas, state, options = {}) {
  // Replace the base release-only effect (8 ticks) with the entire readiness cue.
  const visualState = {
    ...state,
    players: state.players.map((p) => (p.shieldRelease > 0 ? { ...p, shieldRelease: 0 } : p)),
  };
  renderBase(canvas, visualState, options);
  const ctx = canvas.getContext('2d');
  for (const player of state.players) {
    if (player.dead) continue;
    const shield = shieldVisualState(player);
    ctx.save();
    if (!player.shielding && shield.remaining > 0) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#252b2a';
      ctx.beginPath();
      ctx.arc(player.x, player.y - 4, 31, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = shield.color;
      ctx.beginPath();
      ctx.arc(
        player.x,
        player.y - 4,
        31,
        -Math.PI / 2,
        -Math.PI / 2 + (Math.PI * 2 * shield.remaining) / shield.total,
      );
      ctx.stroke();
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#101510';
      ctx.fillStyle = shield.color;
      const text = `${shield.remaining}f`;
      ctx.strokeText(text, player.x, player.y - 40);
      ctx.fillText(text, player.x, player.y - 40);
    }
    if (options.showHitboxes) {
      ctx.fillStyle = '#6cffe522';
      ctx.strokeStyle = '#051b18';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_BODY_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#6cffe5';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(player.x - 3, player.y);
      ctx.lineTo(player.x + 3, player.y);
      ctx.moveTo(player.x, player.y - 3);
      ctx.lineTo(player.x, player.y + 3);
      ctx.stroke();
    }
    ctx.restore();
  }
}
