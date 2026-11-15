import { getStateMap } from '/rando-sim-gym/nav-5/balanced-vs-aggressive/shared/sim/map-state.js';

function cover(ctx, r, industrial) {
  ctx.fillStyle = industrial ? '#505b62' : '#777d68';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = industrial ? '#c0c9ca' : '#c6c9a1';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = industrial ? '#68767d' : '#929779';
  ctx.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
  ctx.strokeStyle = industrial ? '#3a454d' : '#636d55';
  ctx.strokeRect(r.x + 11, r.y + 11, r.w - 22, r.h - 22);
  for (const [x, y] of [
    [r.x + 7, r.y + 7],
    [r.x + r.w - 10, r.y + 7],
    [r.x + 7, r.y + r.h - 10],
    [r.x + r.w - 10, r.y + r.h - 10],
  ]) {
    ctx.fillStyle = industrial ? '#d9bd73' : '#c6c9a1';
    ctx.fillRect(x, y, 3, 3);
  }
  if (!industrial) {
    ctx.strokeStyle = '#415d48';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r.x + 22, r.y + 22);
    ctx.lineTo(r.x + r.w - 23, r.y + r.h - 23);
    ctx.stroke();
    ctx.fillStyle = '#6b9965';
    for (const [dx, dy] of [
      [24, 24],
      [35, 30],
      [40, 43],
      [50, 49],
    ]) {
      ctx.beginPath();
      ctx.ellipse(r.x + dx, r.y + dy, 8, 4, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function conveyor(ctx, surface, time) {
  const r = surface,
    vertical = Math.abs(r.velocityY) >= Math.abs(r.velocityX),
    sign = (vertical ? r.velocityY : r.velocityX) >= 0 ? 1 : -1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = '#20292e';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#68767d';
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.strokeStyle = '#465157';
  ctx.lineWidth = 2;
  const offset = (time * 1.5 * sign) % 20;
  for (let n = -20; n < (vertical ? r.h : r.w) + 20; n += 20) {
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(r.x + 8, r.y + n + offset);
      ctx.lineTo(r.x + r.w - 8, r.y + n + offset);
    } else {
      ctx.moveTo(r.x + n + offset, r.y + 8);
      ctx.lineTo(r.x + n + offset, r.y + r.h - 8);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#e7c36a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'square';
  for (let n = 24; n < (vertical ? r.h : r.w); n += 40) {
    const x = vertical ? r.x + r.w / 2 : r.x + n,
      y = vertical ? r.y + n : r.y + r.h / 2;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(x - 11, y - sign * 7);
      ctx.lineTo(x, y + sign * 5);
      ctx.lineTo(x + 11, y - sign * 7);
    } else {
      ctx.moveTo(x - sign * 7, y - 11);
      ctx.lineTo(x + sign * 5, y);
      ctx.lineTo(x - sign * 7, y + 11);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#a98b49';
  if (vertical) {
    ctx.fillRect(r.x + 4, r.y + 4, 3, r.h - 8);
    ctx.fillRect(r.x + r.w - 7, r.y + 4, 3, r.h - 8);
  } else {
    ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, 3);
    ctx.fillRect(r.x + 4, r.y + r.h - 7, r.w - 8, 3);
  }
  ctx.restore();
}
function glass(ctx, object) {
  const r = object,
    health = Math.max(0, Math.min(1, r.hp / (r.maxHp || r.hp || 1)));
  if (!r.solid) {
    ctx.fillStyle = '#90c5c14d';
    for (const [dx, dy] of [
      [0.2, 0.18],
      [0.68, 0.28],
      [0.34, 0.56],
      [0.7, 0.75],
    ]) {
      const x = r.x + r.w * dx,
        y = r.y + r.h * dy;
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 3);
      ctx.lineTo(x + 5, y + 5);
      ctx.lineTo(x + 1, y - 5);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  ctx.fillStyle = r.pendingDestroy ? '#a8dfcd66' : '#78c8ce40';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = r.pendingDestroy ? '#ffe8a0' : '#99dcd3';
  ctx.lineWidth = r.pendingDestroy ? 3 : 2;
  ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
  ctx.strokeStyle = '#c6f5ec88';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r.x + 7, r.y + r.h * 0.5);
  ctx.lineTo(r.x + r.w - 7, r.y + 8);
  ctx.moveTo(r.x + 8, r.y + r.h * 0.72);
  ctx.lineTo(r.x + r.w - 8, r.y + r.h * 0.3);
  ctx.stroke();
  if (health < 0.75) {
    ctx.strokeStyle = r.pendingDestroy ? '#fff1c5' : '#ddfff0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.5, r.y + 5);
    ctx.lineTo(r.x + r.w * 0.35, r.y + r.h * 0.35);
    ctx.lineTo(r.x + r.w * 0.65, r.y + r.h * 0.55);
    ctx.lineTo(r.x + r.w * 0.4, r.y + r.h - 9);
    if (health < 0.4) {
      ctx.moveTo(r.x + 4, r.y + r.h * 0.35);
      ctx.lineTo(r.x + r.w * 0.35, r.y + r.h * 0.35);
      ctx.lineTo(r.x + r.w - 4, r.y + r.h * 0.18);
      ctx.moveTo(r.x + 4, r.y + r.h * 0.8);
      ctx.lineTo(r.x + r.w * 0.65, r.y + r.h * 0.55);
      ctx.lineTo(r.x + r.w - 4, r.y + r.h * 0.7);
    }
    ctx.stroke();
  }
  if (health < 1) {
    ctx.fillStyle = '#192a29';
    ctx.fillRect(r.x + 5, r.y + r.h - 8, r.w - 10, 3);
    ctx.fillStyle = r.pendingDestroy ? '#ffe8a0' : '#a1ded4';
    ctx.fillRect(r.x + 5, r.y + r.h - 8, (r.w - 10) * health, 3);
  }
}
/** Draw in world coordinates after the base floor, before weapons and fighters. */
export function drawMapDetails(ctx, state, time = state.tick || 0) {
  const map = getStateMap(state);
  if (!['industrial', 'glasshouse'].includes(map.theme)) return;
  ctx.save();
  // Edge fixtures are outside the play boundary and never imply extra solid cover.
  ctx.fillStyle = map.theme === 'industrial' ? '#687078' : '#638b70';
  for (let y = 70; y < map.height; y += 100) {
    ctx.fillRect(7, y, 7, 34);
    ctx.fillRect(map.width - 14, y, 7, 34);
  }
  for (const surface of map.surfaces) conveyor(ctx, surface, time);
  for (const wall of map.walls) cover(ctx, wall, map.theme === 'industrial');
  for (const object of state.map?.objects || []) glass(ctx, object);
  ctx.restore();
}

export { drawAuthoredMap, drawMapGraybox } from './authored-map-renderer.js';
