import { selfDamageEnabled } from '../shared/sim/composed/self-damage.js';
import { SWIPE } from '../shared/sim/composed/swipe.js';
import {
  direction,
  dir,
  clamp,
  blockedSegment,
  solidRect,
} from '../shared/sim/composed/geometry.js';
import { previewPlacement } from '../shared/sim/composed/runtime.js';
import {
  teleportDestination,
  previewRay,
  componentWalls,
  isBeam,
} from '../shared/sim/composed/mechanics.js';
import { TEAMS, relationDamageScale } from '../shared/sim/teams.js';
import {
  composedStyle,
  drawSlash,
  drawThrust,
  drawBeam,
  isBloomBeam,
  drawLob,
  drawLobTelegraph,
} from './composed-effects.js?v=33';
import { drawSweepWarning } from './sweep-warning.js';
const TAU = Math.PI * 2;
// Historical recordings keep the range used by their frozen engine.
const SWIPE_RANGE_BY_BUILD = Object.freeze({
  'composed-b4': 50,
  'composed-b5': 50,
  'composed-b6': SWIPE.range,
  'composed-b7': SWIPE.range,
});
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function footprint(ctx, g, linkLength) {
  ctx.beginPath();
  if (g.kind === 'circle') ctx.arc(0, 0, g.radius, 0, TAU);
  else if (g.kind === 'sector') {
    const half = (Math.ceil(g.arc / 2) * TAU) / 32;
    ctx.arc(0, 0, g.radius, -half, half);
    if (g.innerRadius) ctx.arc(0, 0, g.innerRadius, half, -half, true);
    else ctx.lineTo(0, 0);
    ctx.closePath();
  } else if (g.kind === 'box') ctx.rect(0, -g.width / 2, g.length, g.width);
  else {
    const length = linkLength ?? g.length,
      r = g.kind === 'capsule' ? g.radius : g.width / 2;
    ctx.moveTo(0, -r);
    ctx.lineTo(length, -r);
    ctx.arc(length, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, r);
    ctx.arc(0, 0, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
  }
}
/** A free beam's full length, which its taper is measured against (as `beamLength` in the simulation). */
const beamFullLength = (template) =>
  template?.ray?.kind === 'reflect' ? template.ray.range : (template?.geometry?.[0]?.length ?? 0);
function glyph(ctx, move, color) {
  if (!move.sprite) return;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const n = Number(move.sprite[y]?.[x]);
      if (!n) continue;
      ctx.fillStyle = n === 1 ? color : n === 2 ? '#15201f' : '#f4ffe9';
      ctx.fillRect(x * 2 - 8, y * 2 - 8, 2, 2);
    }
}
function drawReflectedRay(ctx, e, color) {
  const width = Math.max(2, ...(e.geometries || [e.geometry]).map((g) => g?.width || 2));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = e.warning ? 0.6 : 0.85;
  ctx.lineWidth = e.warning ? 2 : width;
  if (e.warning) ctx.setLineDash([5, 4]);
  for (const segment of e.raySegments) {
    ctx.beginPath();
    ctx.moveTo(segment.x, segment.y);
    ctx.lineTo(segment.endX, segment.endY);
    if (e.warning) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.restore();
    }
    ctx.stroke();
  }
  if (!e.warning) {
    ctx.strokeStyle = '#f4ffe9';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    for (const segment of e.raySegments) {
      ctx.beginPath();
      ctx.moveTo(segment.x, segment.y);
      ctx.lineTo(segment.endX, segment.endY);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  for (const segment of e.raySegments.slice(0, -1)) {
    ctx.beginPath();
    ctx.arc(segment.endX, segment.endY, 4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
function drawCompanion(ctx, e, t, color) {
  const appearance = e.actor.appearance || {},
    stride = Math.sin(t * 0.7 + e.id) * 2;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(((e.angle || 0) * TAU) / 32);
  if (e.warning) ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#080f0e66';
  ctx.beginPath();
  ctx.ellipse(0, 3, 16, 10, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = appearance.secondaryColor || color;
  ctx.lineWidth = 4;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-6, sign * 6);
    ctx.lineTo(-9 + stride * sign, sign * 11);
    ctx.moveTo(7, sign * 5);
    ctx.lineTo(8 - stride * sign, sign * 10);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fillRect(-12, -6, 22, 12);
  ctx.fillRect(7, -7, 10, 14);
  ctx.fillStyle = appearance.secondaryColor || color;
  ctx.fillRect(8, -10, 5, 5);
  ctx.fillRect(8, 5, 5, 5);
  ctx.fillStyle = '#f4ffe9';
  ctx.fillRect(13, -4, 3, 2);
  ctx.fillRect(13, 2, 3, 2);
  ctx.fillStyle = '#15201f';
  ctx.fillRect(17, -3, 4, 6);
  ctx.fillStyle = appearance.color || color;
  ctx.fillRect(4, -7, 3, 14);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(-18, Math.sin(t * 0.3) * 4);
  ctx.stroke();
  ctx.restore();
}
/** Whether a force field is moving any player, by the rules of `sampleForces`
 * in shared/sim/composed/runtime.js: armed, in range, in sight, and a target its
 * owner can affect. A dashing player is not pushed. */
export function forcePushing(state, e) {
  if (!e.force || e.removed || e.age < e.arm || e.bornTick >= state.tick) return false;
  const owner = state.players.find((p) => p.id === e.owner);
  let walls = null;
  return state.players.some((p) => {
    if (p.dead || p.dashTicks > 0 || !relationDamageScale(e.move, owner, p, state)) return false;
    const distance = Math.hypot(p.x - e.x, p.y - e.y);
    if (distance === 0 || distance > e.force.radius) return false;
    walls ??= componentWalls(state);
    return !blockedSegment(e.x, e.y, p.x, p.y, walls);
  });
}
export function drawComposedEntity(ctx, e, t, drawCharacter, state, displayColor) {
  if (!e.move) return;
  const waiting = e.warning,
    color = displayColor || e.coreColor || e.move.coreColor,
    template = e.move.templates.find((template) => template.id === e.templateId),
    style = composedStyle(e, template);
  // A terminal blast remains legible while its parent travels or counts down.
  const blast = template?.events
    .filter((event) => event.when === 'terminal')
    .flatMap((event) => event.actions)
    .find((action) => action.op === 'spawn');
  const blastTemplate =
      blast && e.move.templates.find((template) => template.id === blast.template),
    radius = blastTemplate?.geometry.find((g) => g.kind === 'circle')?.radius;
  // Labels follow the body, which a lob draws above its true position.
  let body = { x: e.x, y: e.y };
  // A traced beam draws its path, which is empty when it starts inside a wall.
  // A growing or tapered one blooms along that path.
  if (e.raySegments && style === 'beam')
    drawBeam(ctx, e, color, e.linkTo ? 0 : beamFullLength(template));
  else if (e.raySegments) drawReflectedRay(ctx, e, color);
  else if (e.actor?.kind === 'decoy' && drawCharacter) {
    ctx.save();
    ctx.globalAlpha = waiting ? 0.45 : 1;
    drawCharacter(
      ctx,
      displayColor ? { ...e.actor.appearance, color: displayColor } : e.actor.appearance,
      e.x,
      e.y,
      3,
      t,
      true,
    );
    ctx.restore();
  } else if (e.actor?.kind === 'companion') drawCompanion(ctx, e, t, color);
  else if (style === 'lob')
    body = drawLob(ctx, e, color, footprint, radius || e.geometry?.radius || 12);
  else {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(
      e.linkTo ? Math.atan2(e.linkTo.y - e.y, e.linkTo.x - e.x) : ((e.angle || 0) * TAU) / 32,
    );
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = waiting ? 1.5 : 2;
    if (waiting) ctx.setLineDash([4, 4]);
    const linkLength = e.linkTo ? Math.hypot(e.linkTo.x - e.x, e.linkTo.y - e.y) : undefined;
    // Armed melee gets its strike; while waiting it shows the plain warning.
    if (style === 'slash' && !waiting) drawSlash(ctx, e, template, color, footprint);
    else if (style === 'thrust' && !waiting) drawThrust(ctx, e, template, color, footprint);
    else if (!(waiting && template && drawSweepWarning(ctx, template, color)))
      for (const g of e.geometries || [e.geometry]) {
        footprint(ctx, g, linkLength);
        ctx.globalAlpha = waiting ? 0.1 : 0.25;
        ctx.fill();
        ctx.globalAlpha = waiting ? 0.6 : 1;
        ctx.stroke();
      }
    ctx.restore();
  }
  // A bright inner rim marks a circle that turns beams once it is armed.
  if (template?.reflectsBeams && !waiting) {
    ctx.save();
    ctx.strokeStyle = '#f4ffe9';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, Math.max(1, e.geometry.radius - 3), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  // A lob's landing marker already shows its blast.
  if (radius && style !== 'lob') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  if (e.force) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    const r = e.force.radius;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrows only while the field actually moves someone; the ring shows its reach.
    const arrows = state && forcePushing(state, e) ? 8 : 0;
    for (let n = 0; n < arrows; n++) {
      ctx.save();
      ctx.rotate((n * TAU) / 8);
      const distance = 22 + ((t % 24) / 24) * Math.max(1, r - 32),
        sign = e.force.direction === 'pull' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(distance - sign * 5, -4);
      ctx.lineTo(distance, 0);
      ctx.lineTo(distance - sign * 5, 4);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.translate(body.x, body.y);
  if (!e.actor) glyph(ctx, e.move, color);
  if (e.maxHp > 0) {
    const y = e.actor?.kind === 'decoy' ? 24 : 15;
    ctx.fillStyle = '#142120';
    ctx.fillRect(-14, y, 28, 4);
    ctx.fillStyle = color;
    ctx.fillRect(-14, y, 28 * Math.max(0, e.hp / e.maxHp), 4);
  }
  if (radius && e.motion?.kind === 'stationary') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, e.ttl / e.lifetime));
    ctx.stroke();
  }
  ctx.restore();
}
export function drawComposedTelegraphs(ctx, state, attackColors) {
  drawObjectives(ctx, state);
  for (const player of state.players) {
    // Frozen builds before b9 called the swipe melee.
    const swipe = player.swipeAttack ?? player.meleeAttack;
    if (player.dead || !swipe) continue;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate((swipe.direction * TAU) / 32);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(
      0,
      0,
      SWIPE_RANGE_BY_BUILD[state.engineBuild] ?? SWIPE.range,
      -Math.PI / 4,
      Math.PI / 4,
    );
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.restore();
  }
  for (const p of state.players) {
    if (p.dead) continue;
    const attack = p.attack;
    if (!attack) continue;
    const move = p.loadout[attack.slot],
      color = attackColors?.get(p.id) || move?.coreColor,
      root = move?.templates.find((t) => t.id === move.root);
    if (!root) continue;
    if (move.casterAction?.kind === 'teleport') {
      const destination = teleportDestination(state, p, move, attack.aimX, attack.aimY);
      ctx.save();
      ctx.strokeStyle = destination ? color : '#ff754c';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, 0, TAU);
      ctx.stroke();
      if (destination) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(destination.x, destination.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(destination.x, destination.y, 17, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(destination.x - 7, destination.y);
        ctx.lineTo(destination.x + 7, destination.y);
        ctx.moveTo(destination.x, destination.y - 7);
        ctx.lineTo(destination.x, destination.y + 7);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (root.solid) {
      // The engine's own placement: where the wall would stand, or a cross where it cannot.
      const pose = previewPlacement(state, p, move, attack.aimX, attack.aimY);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      if (pose) {
        const r = solidRect({ ...pose, geometry: root.geometry[0] });
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.12;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.globalAlpha = 0.75;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      } else {
        ctx.strokeStyle = '#ff754c';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(attack.aimX - 8, attack.aimY - 8);
        ctx.lineTo(attack.aimX + 8, attack.aimY + 8);
        ctx.moveTo(attack.aimX + 8, attack.aimY - 8);
        ctx.lineTo(attack.aimX - 8, attack.aimY + 8);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (root.motion.kind === 'lob') {
      const blast = root.events
          .filter((event) => event.when === 'terminal')
          .flatMap((event) => event.actions)
          .find((action) => action.op === 'spawn'),
        blastRadius = move.templates
          .find((template) => template.id === blast?.template)
          ?.geometry.find((g) => g.kind === 'circle')?.radius;
      drawLobTelegraph(
        ctx,
        p,
        root,
        attack.aimX,
        attack.aimY,
        color,
        blastRadius || root.geometry[0].radius || 12,
      );
      continue;
    }
    if (isBeam(root)) {
      const raySegments = previewRay(state, p, move, attack.aimX, attack.aimY, attack.firingPose);
      if (attack.firingPose) {
        ctx.save();
        ctx.strokeStyle = raySegments.length ? color : '#ff754c';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(attack.firingPose.x, attack.firingPose.y, 5, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      const preview = { raySegments, warning: true, geometries: root.geometry };
      if (isBloomBeam(root.geometry[0])) drawBeam(ctx, preview, color, beamFullLength(root));
      else drawReflectedRay(ctx, preview, color);
      continue;
    }
    const angle = direction(attack.aimX - p.x, attack.aimY - p.y),
      [dx, dy] = dir(angle),
      distance =
        root.origin === 'caster_muzzle'
          ? 15 +
            Math.max(
              root.physicalRadius,
              ...root.geometry.map((g) =>
                ['circle', 'capsule', 'sector'].includes(g.kind) ? g.radius : g.width / 2,
              ),
            )
          : root.origin === 'aim_point_clamped'
            ? Math.min(210, Math.hypot(attack.aimX - p.x, attack.aimY - p.y))
            : 0;
    const x = clamp(p.x + dx * distance, 20 + root.physicalRadius, 940 - root.physicalRadius),
      y = clamp(p.y + dy * distance, 20 + root.physicalRadius, 620 - root.physicalRadius);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((angle * TAU) / 32);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    if (drawSweepWarning(ctx, root, color)) {
      ctx.restore();
      continue;
    }
    for (const g of root.geometry) {
      footprint(ctx, g);
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.stroke();
    }
    ctx.restore();
  }
}
export function abilityStatusMarkup(
  move,
  player,
  index,
  keyPrefix = '',
  teamBattle = false,
  state = {},
) {
  const r = player.moveResources?.[move.name] || {},
    cooldown = r.cooldown || 0,
    kind = move.resource.kind;
  let status =
    r.reload > 0
      ? 'RELOAD ' + (r.reload / 30).toFixed(1) + 'S'
      : r.overheated
        ? 'OVERHEATED'
        : r.recovery > 0
          ? 'RECOVERY'
          : cooldown > 0
            ? (cooldown / 30).toFixed(1) + 'S'
            : move.activation.mode === 'hold'
              ? 'HOLD TO FIRE'
              : 'READY';
  if (kind === 'magazine' || kind === 'charges')
    status +=
      ' · ' +
      (r.ammo ?? move.resource.capacity) +
      (kind === 'magazine' ? '/' + move.resource.capacity : ' LEFT');
  if (kind === 'heat')
    status += ' · HEAT ' + Math.round(r.heat || 0) + '/' + move.resource.threshold;
  if (kind === 'fatigue') status += ' · FATIGUE ' + (r.fatigue || 0);
  if (move.setup.kind === 'pair')
    status =
      r.sequence === 1
        ? 'PLACE SECOND · ' + Math.ceil(r.timeout / 30) + 'S'
        : r.sequence === 2
          ? 'LINK ACTIVE'
          : 'PLACE FIRST';
  const red = parseInt(move.coreColor.slice(1, 3), 16),
    green = parseInt(move.coreColor.slice(3, 5), 16),
    risk =
      (teamBattle ? 'ALLY ' + Math.round((red / 255) * 100) + '% · ' : '') +
      'SELF ' +
      Math.round(((selfDamageEnabled(move, state) ? Math.min(red, green) : 0) / 255) * 100) +
      '%';
  return `<div class="ability ${cooldown > 0 || r.reload ? 'cooling' : ''}" title="${esc(move.counterplay.join(' '))}"><div class="cooldown-fill" style="height:${Math.min(100, (cooldown / Math.max(1, move.resource.cooldown)) * 100)}%"></div><kbd>${esc(keyPrefix)}${index + 1}</kbd><div class="ability-name">${esc(move.name)}</div><div class="ability-status">${esc(status)}</div><small class="damage-risk" style="border-color:${esc(move.coreColor)}">${risk}</small></div>`;
}

function drawObjectives(ctx, state) {
  if (state.mode !== 'ctf') return;
  for (const base of state.flagBases || []) {
    ctx.save();
    ctx.strokeStyle = TEAMS.find((team) => team.id === base.team)?.color || '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(base.x, base.y, 26, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  for (const flag of state.flags || []) {
    const carrier =
      flag.status === 'carried'
        ? state.players.find((player) => player.id === flag.carrierId)
        : null;
    const x = carrier ? carrier.x + 20 : flag.x,
      y = carrier ? carrier.y - 18 : flag.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(0, -18);
    ctx.stroke();
    ctx.fillStyle = TEAMS.find((team) => team.id === flag.team)?.color || '#ffffff';
    ctx.beginPath();
    ctx.moveTo(1, -18);
    ctx.lineTo(21, -11);
    ctx.lineTo(1, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
