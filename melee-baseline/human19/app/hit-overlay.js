import { hitCenterY } from '../shared/sim/composed/hit-center.js';

export function drawHitCircle(ctx, x, anchorY, radius) {
  const y = hitCenterY(anchorY);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffc42d30';
  ctx.fill();
  ctx.strokeStyle = '#211409';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 2.5, y);
  ctx.lineTo(x + 2.5, y);
  ctx.moveTo(x, y - 2.5);
  ctx.lineTo(x, y + 2.5);
  ctx.stroke();
  ctx.restore();
}
