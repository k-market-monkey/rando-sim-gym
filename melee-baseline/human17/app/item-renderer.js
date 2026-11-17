// Item drops on the floor, and the item effects a fighter carries.
import { ITEM_RADIUS, ITEM_WARNING } from '../shared/content/items.js';

/** Ring colour of each kind; the pickup flash uses it too. */
export const ITEM_COLORS = {
  health: '#e0446a',
  poison: '#8f62b0',
  shield: '#f2c94c',
  speed: '#5fe0c8',
};
export const itemColor = (kind) => ITEM_COLORS[kind] || '#edf8c7';

function pack(ctx, x, y, box, cross) {
  ctx.fillStyle = box;
  ctx.fillRect(x - 8, y - 7, 16, 14);
  ctx.fillStyle = cross;
  ctx.fillRect(x - 2, y - 5, 4, 10);
  ctx.fillRect(x - 5, y - 2, 10, 4);
}

function drawItem(ctx, item, t) {
  // Blink in the last seconds before the item disappears.
  if (item.ttl <= ITEM_WARNING && Math.floor(t / 4) % 2) return;
  const { x, y, kind } = item,
    bob = Math.floor(t / 10) % 2;
  ctx.save();
  ctx.fillStyle = '#080f0e66';
  ctx.beginPath();
  ctx.ellipse(x, y + ITEM_RADIUS, ITEM_RADIUS, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -bob);
  ctx.strokeStyle = itemColor(kind);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, ITEM_RADIUS + 2, 0, Math.PI * 2);
  ctx.stroke();
  // A poisoned pack copies the health pack with a duller box and a purple cross.
  if (kind === 'health') pack(ctx, x, y, '#f7ffe6', '#e0446a');
  else if (kind === 'poison') pack(ctx, x, y, '#cfdcae', '#8f62b0');
  else if (kind === 'shield') {
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 7);
    ctx.lineTo(x + 7, y - 7);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 7, y);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'speed') {
    ctx.strokeStyle = '#5fe0c8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const dx of [-5, 2]) {
      ctx.moveTo(x + dx - 2, y - 6);
      ctx.lineTo(x + dx + 4, y);
      ctx.lineTo(x + dx - 2, y + 6);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws every item lying on the floor. */
export function drawItems(ctx, state) {
  const t = state.tick || 0;
  for (const item of state.items || []) drawItem(ctx, item, t);
}

/** Draws a fighter's item shield ring and speed streaks, under the sprite. */
export function drawItemEffects(ctx, p, t = 0) {
  if (!(p.itemShield > 0) && !(p.itemSpeed > 0)) return;
  ctx.save();
  if (p.itemSpeed > 0 && (p.vx || p.vy)) {
    const speed = Math.hypot(p.vx, p.vy) || 1,
      ux = p.vx / speed,
      uy = p.vy / speed;
    ctx.strokeStyle = '#5fe0c899';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const side of [-8, 0, 8]) {
      const sx = p.x - uy * side - ux * 14,
        sy = p.y + 4 + ux * side - uy * 14;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - ux * 14, sy - uy * 14);
    }
    ctx.stroke();
  }
  if (p.itemShield > 0 && !(p.itemShield <= ITEM_WARNING && Math.floor(t / 4) % 2)) {
    ctx.strokeStyle = '#f2c94c';
    ctx.fillStyle = '#f2c94c22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
