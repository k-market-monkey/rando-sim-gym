import { survivalBounds } from '../shared/sim/survival.js';
import { arenaSize } from './arena-size.js';
export function drawSurvivalRing(ctx, state) {
  if (!(state.ring > 0)) return;
  const { minX, maxX, minY, maxY } = survivalBounds(state),
    { width, height } = arenaSize(state);
  ctx.fillStyle = '#b7466e66';
  ctx.fillRect(0, 0, width, minY);
  ctx.fillRect(0, maxY, width, height - maxY);
  ctx.fillRect(0, minY, minX, maxY - minY);
  ctx.fillRect(maxX, minY, width - maxX, maxY - minY);
  ctx.strokeStyle = '#ff7f9c';
  ctx.lineWidth = 3;
  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
}
