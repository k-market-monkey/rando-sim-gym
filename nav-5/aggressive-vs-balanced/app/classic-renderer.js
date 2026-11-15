import { TICK_RATE } from '../shared/sim/classic/engine.js';
import { pixelSprite } from './sprite-renderer.js';
function drawMoveGlyph(ctx, m, color, e, t) {
  if (!m.sprite) return;
  ctx.save();
  const scale = Math.max(2, Math.min(4, e.radius / 4));
  if (m.animation === 'spin') ctx.rotate(t * 0.14);
  if (m.animation === 'pulse') {
    const pulse = 1 + Math.sin(t * 0.22) * 0.14;
    ctx.scale(pulse, pulse);
  }
  if (m.animation === 'flicker') ctx.globalAlpha = Math.floor(t / 3) % 3 === 0 ? 0.35 : 1;
  if (m.animation === 'trail') {
    ctx.globalAlpha = 0.2;
    pixelSprite(
      ctx,
      m.sprite,
      -4 * scale - (e.vx || 4) * 1.5,
      -4 * scale - (e.vy || 2) * 1.5,
      scale,
      [null, color, '#fff3cb', '#ffffff'],
    );
    ctx.globalAlpha = 1;
  }
  pixelSprite(ctx, m.sprite, -4 * scale, -4 * scale, scale, [null, color, '#fff3cb', '#ffffff']);
  ctx.restore();
}
export function drawEntity(ctx, e, t, _drawCharacter, _state, displayColor) {
  const m = e.move || {},
    waiting = e.age <= e.windup;
  ctx.save();
  ctx.translate(e.x, e.y);
  const c = displayColor || e.color || '#ffce5c';
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = 2;
  if (waiting) {
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 0.7);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(e.radius, 12) + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (e.kind === 'beam') {
    const length = Math.max(160, Math.min(520, (m.speed || 10) * 32));
    ctx.lineWidth = waiting ? 2 : e.radius * 2;
    ctx.globalAlpha = waiting ? 0.4 : 0.65;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(e.dx * length, e.dy * length);
    ctx.stroke();
    if (!waiting) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f4ffed';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  } else if (e.kind === 'nova' || e.kind === 'trap') {
    ctx.globalAlpha = waiting ? 0.15 : 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = waiting ? 0.4 : 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * (0.5 + 0.15 * Math.sin(t * 0.4)), 0, Math.PI * 2);
    ctx.stroke();
    if (e.kind === 'trap') {
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
    }
  } else if (e.kind === 'wall') {
    ctx.globalAlpha = waiting ? 0.3 : 1;
    ctx.fillStyle = c + '88';
    ctx.fillRect(-e.radius, -e.radius / 2, e.radius * 2, e.radius);
    ctx.strokeRect(-e.radius, -e.radius / 2, e.radius * 2, e.radius);
    for (let x = -e.radius + 8; x < e.radius; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, -e.radius / 2 + 4);
      ctx.lineTo(x, e.radius / 2 - 4);
      ctx.stroke();
    }
  } else {
    if (!waiting) {
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = e.radius * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-(e.vx || 0) * 2, -(e.vy || 0) * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (m.sprite) drawMoveGlyph(ctx, m, c, e, t);
    else {
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (['nova', 'trap', 'wall', 'beam'].includes(e.kind)) {
    ctx.globalAlpha = waiting ? 0.4 : 1;
    drawMoveGlyph(ctx, m, c, e, t);
  }
  ctx.restore();
}
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function abilityStatusMarkup(m, me, i, keyPrefix = '', teamBattle = false) {
  const cd = me.cooldowns[i],
    uses = m.charges - (me.uses[i] || 0);
  return `<div class="ability ${cd > 0 ? 'cooling' : ''}"><div class="cooldown-fill" style="height:${Math.min(100, (cd / m.cooldown) * 100)}%"></div><kbd>${keyPrefix}${i + 1}</kbd><div class="ability-name">${esc(m.name)}</div><div class="ability-status">${m.limit === 'charges' ? uses + ' USES LEFT' : cd > 0 ? (cd / TICK_RATE).toFixed(1) + 'S' : 'READY'}${m.limit === 'fatigue' ? ' · FATIGUE ' + (me.fatigue?.[i] || 0) : ''}</div>${teamBattle ? `<small class="damage-risk" style="border-color:${esc(m.color)}">ALLY ${Math.round((parseInt(m.color.slice(1, 3), 16) / 255) * 100)}% · SELF 0%</small>` : ''}</div>`;
}
