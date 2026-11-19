// Canvas coordinates are relative to the cast origin, facing right.
const unit = Math.PI / 16;
const turn = Math.PI * 2;
const cached = new WeakMap();

function sectorPath(x, y, inner, outer, start, end) {
  const path = new Path2D();
  if (end - start >= turn) {
    path.arc(x, y, outer, 0, turn);
    path.closePath();
    if (inner) {
      path.moveTo(x + inner, y);
      path.arc(x, y, inner, turn, 0, true);
      path.closePath();
    }
  } else {
    path.arc(x, y, outer, start, end);
    if (inner) path.arc(x, y, inner, end, start, true);
    else path.lineTo(x, y);
    path.closePath();
  }
  return path;
}

function makeWarning(template, g, color) {
  const { sweep, offset } = template.motion;
  const frames = Math.max(1, template.lifetime - template.arm);
  // moveObject rounds each active pose to a heading. Collision also sweeps from the spawn pose.
  const first = Math.round(sweep * (1 / frames - 0.5)),
    last = Math.round(sweep * 0.5);
  const low = Math.min(0, first, last),
    high = Math.max(0, first, last);
  const half = Math.ceil(g.arc / 2) * unit;
  const pad = Math.ceil(g.radius + offset + 6);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pad * 2;
  const ctx = canvas.getContext('2d');
  ctx.translate(pad, pad);
  const paths = [];
  if (!offset) {
    paths.push(sectorPath(0, 0, g.innerRadius, g.radius, low * unit - half, high * unit + half));
  } else {
    // The blade origin rotates too. Union the intervening poses instead of drawing a larger fan.
    const segments = Math.max(1, Math.ceil((high - low) * unit * (offset + g.radius)));
    for (let i = 0; i <= segments; i++) {
      const a = (low + ((high - low) * i) / segments) * unit;
      paths.push(
        sectorPath(
          offset * Math.cos(a),
          offset * Math.sin(a),
          g.innerRadius,
          g.radius,
          a - half,
          a + half,
        ),
      );
    }
  }
  const union = new Path2D();
  for (const path of paths) union.addPath(path);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 4]);
  for (const path of paths) ctx.stroke(path);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(union);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16;
  ctx.fill(union);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  // Mark the first leading edge, then point along its direction of travel.
  const sign = Math.sign(sweep),
    heading = first * unit,
    edge = heading + sign * half;
  ctx.translate(offset * Math.cos(heading), offset * Math.sin(heading));
  ctx.rotate(edge);
  ctx.strokeStyle = '#fff5cb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.max(g.innerRadius, g.radius - 10), 0);
  ctx.lineTo(g.radius, 0);
  ctx.stroke();
  if (first !== last) {
    const radius = Math.max(4, g.radius - 3),
      angle = Math.min(0.55, Math.abs(last - first) * unit) * sign;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, angle, sign < 0);
    ctx.stroke();
    ctx.rotate(angle);
    ctx.translate(radius, 0);
    ctx.beginPath();
    ctx.moveTo(-3, -sign * 4);
    ctx.lineTo(0, 0);
    ctx.lineTo(3, -sign * 4);
    ctx.stroke();
  }
  return { canvas, pad, color };
}
export function drawSweepWarning(ctx, template, color) {
  const g = template.geometry[0];
  if (
    template.motion.kind !== 'caster_attached' ||
    !template.motion.sweep ||
    template.geometry.length !== 1 ||
    g.kind !== 'sector'
  )
    return false;
  let sprite = cached.get(template);
  if (!sprite || sprite.color !== color)
    cached.set(template, (sprite = makeWarning(template, g, color)));
  ctx.drawImage(sprite.canvas, -sprite.pad, -sprite.pad);
  return true;
}
