// Drawing styles for Composed moves: melee slashes and thrusts, blooming beams
// and lobbed projectiles. Presentation only: these read entity state and the
// move definition and never change the simulation. Hit areas stay visible as a
// faint footprint under each effect so the style never hides what can hit.
const TAU = Math.PI * 2;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeOut = (value) => 1 - (1 - value) * (1 - value);

/** Half the angle of a sector, as the simulation measures it. */
export const sectorHalf = (g) => (Math.ceil(g.arc / 2) * TAU) / 32;

/** Whether a segment grows or tapers: drawn as a blooming beam. */
export const isBloomBeam = (g) =>
  g?.kind === 'segment' && (g.extend > 0 || (g.endWidth !== undefined && g.endWidth !== g.width));

/** How far a shape reaches from its origin along its facing. */
function reach(g) {
  if (g.kind === 'circle' || g.kind === 'sector') return g.radius;
  if (g.kind === 'box') return g.length;
  return g.length + (g.kind === 'capsule' ? g.radius : g.width / 2);
}

/**
 * The drawing style of an entity: 'slash', 'thrust', 'beam', 'lob' or null for
 * the plain footprint. `template.visual` picks a melee style; 'auto' or absent
 * infers one from caster-attached geometry.
 */
export function composedStyle(e, template) {
  const motion = e.motion?.kind,
    geometries = e.geometries || [e.geometry];
  if (motion === 'lob' && e.toX !== undefined) return 'lob';
  if (template?.visual === 'slash' || template?.visual === 'thrust') return template.visual;
  if (motion === 'caster_attached') {
    const g = geometries[0];
    if (g?.kind === 'sector') return 'slash';
    if (['capsule', 'segment', 'box'].includes(g?.kind)) return 'thrust';
  }
  if (geometries.some(isBloomBeam)) return 'beam';
  return null;
}

/**
 * Armed ticks drawn so far and the armed span, for melee timing. The spawn
 * frame still shows the warning, so the first armed frame is age `arm + 1`.
 */
function activeTiming(e, template) {
  const arm = e.arm ?? template?.arm ?? 0,
    lifetime = e.lifetime ?? template?.lifetime ?? 1;
  return { active: Math.max(0, (e.age ?? 0) - arm - 1), span: Math.max(1, lifetime - arm - 1) };
}

/** A capsule's outline between two circles of different radii along +x. */
export function taperPath(ctx, length, r0, r1) {
  ctx.beginPath();
  if (length <= Math.abs(r1 - r0) + 0.5) {
    ctx.arc(length > 0 && r1 > r0 ? length : 0, 0, Math.max(r0, r1), 0, TAU);
    return;
  }
  const s = (r1 - r0) / length,
    c = Math.sqrt(1 - s * s),
    up = Math.atan2(-c, -s),
    down = Math.atan2(c, -s);
  ctx.moveTo(-s * r0, -c * r0);
  ctx.lineTo(length - s * r1, -c * r1);
  ctx.arc(length, 0, r1, up, down);
  ctx.lineTo(-s * r0, c * r0);
  ctx.arc(0, 0, r0, down, up + TAU);
  ctx.closePath();
}

/** The faint true hit area under a styled effect. */
function faintFootprint(ctx, footprint, geometries, linkLength, alpha = 0.12) {
  for (const g of geometries) {
    footprint(ctx, g, linkLength);
    ctx.globalAlpha = alpha;
    ctx.fill();
  }
}

/**
 * A blade sweeping its arc: ghost blades where it was, a fading crescent and a
 * bright leading edge, like the built-in swipe. Drawn in the entity's frame.
 */
export function drawSlash(ctx, e, template, color, footprint) {
  const geometries = e.geometries || [e.geometry],
    g = geometries[0],
    sector = g.kind === 'sector',
    outer = reach(g),
    inner = sector ? g.innerRadius || 0 : 0,
    half = sector ? sectorHalf(g) : Math.PI / 5,
    { active, span } = activeTiming(e, template),
    progress = clamp01(active / span),
    sweep = template?.motion?.sweep || 0,
    perTick = (sweep * TAU) / 32 / span,
    sign = sweep < 0 ? -1 : 1;
  faintFootprint(ctx, footprint, geometries, undefined, 0.1);
  // Afterimages: the blade's pose over the last ticks.
  if (sweep && sector)
    for (let k = 3; k >= 1; k--) {
      if (active < k) continue;
      ctx.save();
      ctx.rotate(-perTick * k);
      footprint(ctx, g);
      ctx.globalAlpha = 0.16 / k;
      ctx.fill();
      ctx.restore();
    }
  // The crescent runs from where the edge has been to where it is now.
  let lead, tail;
  if (sweep) {
    lead = sign * half;
    tail = lead - sign * Math.min(TAU - 0.1, 2 * half + Math.abs(perTick) * Math.min(active, 5));
  } else {
    lead = -half + 2 * half * clamp01((active + 1) / Math.max(2, span * 0.6));
    tail = -half;
  }
  const fade = 1 - progress * 0.65,
    anticlockwise = lead < tail,
    mid = inner + (outer - inner) * 0.62;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.32 * fade;
  ctx.lineWidth = Math.max(3, (outer - inner) * 0.55 * fade);
  ctx.beginPath();
  ctx.arc(0, 0, mid, tail, lead, anticlockwise);
  ctx.stroke();
  ctx.globalAlpha = 0.85 * fade;
  ctx.lineWidth = 7 * fade + 2;
  ctx.beginPath();
  ctx.arc(0, 0, outer * 0.86, tail, lead, anticlockwise);
  ctx.stroke();
  // The edge itself: a white rim near the lead and the blade line.
  const glint = anticlockwise ? Math.min(tail, lead + 0.55) : Math.max(tail, lead - 0.55);
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = fade;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, outer, glint, lead, anticlockwise);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9 * fade;
  ctx.beginPath();
  ctx.moveTo(Math.cos(lead) * Math.max(inner, 6), Math.sin(lead) * Math.max(inner, 6));
  ctx.lineTo(Math.cos(lead) * outer, Math.sin(lead) * outer);
  ctx.stroke();
}

/**
 * A point that shoots out to full reach with speed streaks behind it, then
 * holds and fades. Drawn in the entity's frame.
 */
export function drawThrust(ctx, e, template, color, footprint) {
  const geometries = e.geometries || [e.geometry],
    g = geometries[0],
    full = reach(g),
    r =
      g.kind === 'capsule'
        ? g.radius
        : g.kind === 'circle' || g.kind === 'sector'
          ? 5
          : g.width / 2,
    { active, span } = activeTiming(e, template),
    progress = clamp01(active / span),
    extension = easeOut(clamp01((active + 1) / Math.max(1, Math.min(4, span * 0.45)))),
    fade = 1 - progress * 0.55,
    tip = Math.max(r, full * extension - r);
  faintFootprint(ctx, footprint, geometries, undefined, 0.1);
  // The shaft grows with the point.
  ctx.globalAlpha = 0.35 * fade;
  if (g.kind === 'capsule' || g.kind === 'segment') footprint(ctx, g, Math.max(0, tip - r));
  else {
    ctx.beginPath();
    ctx.rect(0, -r, tip, r * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 0.9 * fade;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Speed streaks, strongest while the point is still moving.
  const streak = 14 + 34 * (1 - extension) + 10 * (1 - progress);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (const [offset, scale] of [
    [-0.9, 0.6],
    [0, 1],
    [0.9, 0.75],
  ]) {
    ctx.globalAlpha = 0.9 * fade * (1.2 - extension * 0.5);
    ctx.beginPath();
    ctx.moveTo(Math.max(0, tip - r - streak * scale), offset * r);
    ctx.lineTo(Math.max(0, tip - r * 0.6), offset * r);
    ctx.stroke();
  }
  // The spearhead.
  const head = Math.max(6, r * 1.4);
  ctx.globalAlpha = fade;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip + r, 0);
  ctx.lineTo(tip - head * 0.7, -head * 0.75);
  ctx.lineTo(tip - head * 0.35, 0);
  ctx.lineTo(tip - head * 0.7, head * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * A beam that shoots out as a thin line over `extend` ticks, then blooms into
 * its tapered width: `width` at the origin, `endWidth` at the far end.
 */
export function drawBeam(ctx, e, color, footprint, linkLength) {
  const age = e.age ?? 0,
    fadeOut = clamp01((e.ttl ?? 4) / 4);
  ctx.lineCap = 'round';
  for (const g of e.geometries || [e.geometry]) {
    if (!isBloomBeam(g)) {
      footprint(ctx, g, linkLength);
      ctx.globalAlpha = 0.25 * fadeOut;
      ctx.fill();
      ctx.globalAlpha = fadeOut;
      ctx.stroke();
      continue;
    }
    const extend = g.extend || 0,
      length = (linkLength ?? g.length) * (extend ? clamp01(age / extend) : 1),
      grown = extend ? length / Math.max(1, linkLength ?? g.length) : 1,
      r0 = g.width / 2,
      r1 = (g.width + ((g.endWidth ?? g.width) - g.width) * grown) / 2,
      bloom = e.warning ? 0 : easeOut(clamp01((age - extend + 1) / 4));
    // The true hit area so far.
    taperPath(ctx, length, r0, r1);
    ctx.globalAlpha = (e.warning ? 0.08 : 0.14) * fadeOut;
    ctx.fill();
    if (e.warning) {
      ctx.globalAlpha = 0.5;
      ctx.stroke();
    }
    if (bloom > 0) {
      taperPath(ctx, length, Math.max(1, r0 * bloom), Math.max(1, r1 * bloom));
      ctx.globalAlpha = 0.4 * fadeOut;
      ctx.fill();
      ctx.globalAlpha = 0.95 * fadeOut;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // The bright core line, with a glowing head while it still extends.
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = (e.warning ? 0.45 : 0.9) * fadeOut;
    ctx.lineWidth = e.warning ? 1 : 2 + bloom;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(length, 0);
    ctx.stroke();
    if (!e.warning && length < (linkLength ?? g.length)) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(length, 0, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(length, 0, 8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Flight progress and height of a lobbed entity. */
export function lobPose(e) {
  const total = Math.hypot(e.toX - e.fromX, e.toY - e.fromY),
    travelled = Math.hypot(e.x - e.fromX, e.y - e.fromY),
    progress = clamp01(total > 0 ? travelled / total : (e.age ?? 0) / Math.max(1, e.flight || 1)),
    peak = Math.max(18, Math.min(90, total * 0.3));
  return { progress, peak, height: 4 * peak * progress * (1 - progress) };
}

function landingMarker(ctx, x, y, radius, color, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  if (filled > 0) {
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(0, 0, radius * filled, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.moveTo(dx * 3, dy * 3);
    ctx.lineTo(dx * 8, dy * 8);
  }
  ctx.stroke();
  ctx.restore();
}

/** A dashed parabola from `from` to `to`, starting at flight progress `start`. */
function arcPath(ctx, fromX, fromY, toX, toY, peak, start) {
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const p = start + ((1 - start) * i) / 16,
      x = fromX + (toX - fromX) * p,
      y = fromY + (toY - fromY) * p - 4 * peak * p * (1 - p);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
}

/**
 * A lobbed projectile: a landing marker, the rest of its arc, a ground shadow
 * at its true position and the body raised by its flight height. Returns where
 * the body was drawn so labels follow it.
 */
export function drawLob(ctx, e, color, footprint, landingRadius) {
  const { progress, peak, height } = lobPose(e),
    angle = ((e.angle || 0) * TAU) / 32;
  landingMarker(ctx, e.toX, e.toY, landingRadius, color, progress);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 5]);
  arcPath(ctx, e.fromX, e.fromY, e.toX, e.toY, peak, progress);
  ctx.stroke();
  ctx.setLineDash([]);
  const lift = height / peak;
  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 0.6 - 0.25 * lift;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, 13 - 5 * lift, 6 - 2 * lift, 0, 0, TAU);
  ctx.fill();
  ctx.translate(e.x, e.y - height);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  for (const g of e.geometries || [e.geometry]) {
    footprint(ctx, g);
    ctx.globalAlpha = e.warning ? 0.2 : 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  ctx.restore();
  return { x: e.x, y: e.y - height };
}

/** Before a lob is cast: its arc and where it will land. */
export function drawLobTelegraph(ctx, p, root, aimX, aimY, color, landingRadius) {
  const dx = aimX - p.x,
    dy = aimY - p.y,
    distance = Math.hypot(dx, dy),
    range = (root.motion.speed || 0) * root.lifetime,
    scale = distance > range && distance > 0 ? range / distance : 1,
    toX = p.x + dx * scale,
    toY = p.y + dy * scale,
    peak = Math.max(18, Math.min(90, Math.hypot(toX - p.x, toY - p.y) * 0.3));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 5]);
  arcPath(ctx, p.x, p.y, toX, toY, peak, 0);
  ctx.stroke();
  ctx.restore();
  landingMarker(ctx, toX, toY, landingRadius, color, 0);
}
