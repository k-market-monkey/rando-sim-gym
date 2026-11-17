// Gym visual fork: original shield animation over the full reactivation delay.
import { drawSurvivalRing } from './survival-renderer.js';
import { drawItems, drawItemEffects, itemColor } from './item-renderer.js';
import { getStateMap } from '/rando-sim-gym/melee-baseline/flight13/shared/sim/map-state.js';
import { TICK_RATE } from '/rando-sim-gym/melee-baseline/flight13/shared/sim/classic/engine.js';
import { drawMapDetails, drawAuthoredMap } from './map-renderer.js';
import { getEngineView } from './engine-view.js';
import { pixelSprite } from './sprite-renderer.js';
import { receiveEmotes, drawEmotes } from './emote-sprites.js';
import {
  CHARACTER_SPRITES,
  sanitizeProfile,
} from '/rando-sim-gym/melee-baseline/flight13/shared/content/characters.js';
import { arenaSize } from './arena-size.js';
import { SWIPE } from '/rando-sim-gym/melee-baseline/flight13/shared/sim/composed/swipe.js';
import { SHIELD } from '/rando-sim-gym/melee-baseline/flight13/shared/sim/composed/shield.js';
const bodies = CHARACTER_SPRITES;
export function drawCharacter(ctx, p, x, y, scale = 3, t = 0, label = false) {
  ctx.save();
  ctx.fillStyle = '#080f0e66';
  ctx.beginPath();
  ctx.ellipse(x, y + (14 * scale) / 3, (14 * scale) / 3, (5 * scale) / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.invuln > 0 && Math.floor(t / 3) % 2) ctx.globalAlpha = 0.5;
  const profile = sanitizeProfile(p),
    rows = bodies[profile.look],
    rgb = profile.color.slice(1),
    luminance =
      parseInt(rgb.slice(0, 2), 16) * 0.2126 +
      parseInt(rgb.slice(2, 4), 16) * 0.7152 +
      parseInt(rgb.slice(4, 6), 16) * 0.0722;
  pixelSprite(ctx, rows, x - 5.5 * scale, y - 7 * scale, scale, [
    null,
    profile.color,
    luminance < 70 ? '#afc2a6' : '#15211c',
    '#24342c',
    '#f7ffe6',
    profile.secondaryColor,
  ]);
  ctx.restore();
  if (label) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#eff4df';
    ctx.fillText(p.name, x, y - 30);
  }
}
export function drawAvatar(canvas, profile) {
  const ctx = canvas.getContext('2d');
  canvas.width = 64;
  canvas.height = 80;
  ctx.clearRect(0, 0, 64, 80);
  drawCharacter(ctx, profile, 32, 45, 4);
}
function drawStage(ctx, stage, t, mode, { width, height }) {
  ctx.fillStyle = '#1d261e';
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height / 40; y++)
    for (let x = 0; x < width / 40; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#293426' : '#263022';
      ctx.fillRect(x * 40 + 1, y * 40 + 1, 39, 39);
      if ((x * 7 + y * 13) % 11 === 0) {
        ctx.fillStyle = '#34402d';
        ctx.fillRect(x * 40 + 9, y * 40 + 13, 3, 3);
        ctx.fillRect(x * 40 + 25, y * 40 + 28, 2, 2);
      }
    }
  ctx.strokeStyle = '#4e5c3b';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  ctx.setLineDash([5, 8]);
  ctx.strokeStyle = '#3a4931';
  ctx.strokeRect(32, 32, width - 64, height - 64);
  ctx.setLineDash([]);
  ctx.strokeStyle = '#3c4932';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 83, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width / 2 - 16, height / 2);
  ctx.lineTo(width / 2 + 16, height / 2);
  ctx.moveTo(width / 2, height / 2 - 16);
  ctx.lineTo(width / 2, height / 2 + 16);
  ctx.stroke();
  if (mode === 'hill') {
    ctx.fillStyle = '#dcf76b13';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dcf76b';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#dcf76b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOLD THE HILL', width / 2, height / 2 + 2);
  }
  for (const r of stage?.hazards || []) {
    const active = t % 90 < 45;
    ctx.fillStyle = active ? '#b65b35' : '#4a3d2c';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.strokeStyle = active ? '#ffab574d' : '#95825b33';
    ctx.lineWidth = 9;
    for (let x = r.x - r.h; x < r.x + r.w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, r.y + r.h);
      ctx.lineTo(x + r.h, r.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = active ? '#ffde97' : '#aa986b';
    ctx.textAlign = 'center';
    ctx.fillText(active ? '▲ HEAT ▲' : 'CAUTION', r.x + r.w / 2, r.y + r.h / 2 + 4);
  }
  for (const r of stage?.pads || []) {
    ctx.fillStyle = '#20493c';
    ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    ctx.strokeStyle = '#78f0c5';
    ctx.strokeRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
    ctx.fillStyle = '#78f0c5';
    ctx.font = 'bold 25px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('»', r.x + r.w / 2, r.y + r.h / 2 + 8);
  }
  for (const r of stage?.walls || []) {
    ctx.fillStyle = '#10190e66';
    ctx.fillRect(r.x + 9, r.y + 12, r.w, r.h);
    ctx.fillStyle = '#626d48';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#adb780';
    ctx.fillRect(r.x, r.y - 9, r.w, r.h - 5);
    ctx.fillStyle = '#cbd79b';
    ctx.fillRect(r.x, r.y - 9, r.w, 4);
    ctx.fillStyle = '#8e9d61';
    ctx.fillRect(r.x + 6, r.y - 3, r.w - 12, r.h - 17);
    ctx.strokeStyle = '#6f7e4b';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 12, r.y + 3, r.w - 24, r.h - 29);
    ctx.fillStyle = '#afbf7d';
    ctx.fillRect(r.x + 17, r.y + 8, 5, 5);
    ctx.fillRect(r.x + r.w - 22, r.y + r.h - 31, 5, 5);
  }
}
const impactEffects = [];
export function receiveEffects(events = []) {
  const now = performance.now();
  for (const event of events) {
    if (
      [
        'hit',
        'kill',
        'shieldbreak',
        'perfect-block',
        'dash',
        'teleport',
        'swipe-contact',
        'deflect',
        'shot-break',
      ].includes(event.type)
    )
      impactEffects.push({ ...event, born: now });
    else if (event.type === 'item')
      impactEffects.push({ ...event, color: itemColor(event.item), born: now });
  }
  if (impactEffects.length > 100) impactEffects.splice(0, impactEffects.length - 100);
  receiveEmotes(events, now);
}
/** A swipe's slash, or the flash of a shot it knocks away. */
function drawStrike(ctx, e, f, color = '#ffffff') {
  const angle = ((e.direction ?? 0) * Math.PI * 2) / 32;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  if (e.type === 'swipe-contact') {
    // The blade sweeps across the cone, leaving a fading crescent.
    const reach = SWIPE.range,
      sweep = -Math.PI / 4 + (Math.PI / 2) * Math.min(1, f * 2.2);
    ctx.globalAlpha = 0.85 * (1 - f);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7 * (1 - f) + 2;
    ctx.beginPath();
    ctx.arc(0, 0, reach * 0.82, -Math.PI / 4, sweep);
    ctx.stroke();
    ctx.globalAlpha = 1 - f;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, reach, Math.max(-Math.PI / 4, sweep - 0.5), sweep);
    ctx.stroke();
  } else if (e.type === 'shot-break') {
    // A shot struck twice crumbles into a puff of fragments.
    ctx.globalAlpha = 1 - f;
    ctx.strokeStyle = '#d8d2c0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 3 + f * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff6c2';
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + 0.4,
        dist = 4 + f * 16;
      ctx.fillRect(Math.cos(angle) * dist - 1.5, Math.sin(angle) * dist - 1.5, 3, 3);
    }
  } else {
    // A bright spark with streaks pointing where the shot now flies.
    ctx.globalAlpha = 1 - f;
    ctx.strokeStyle = '#fff6c2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 4 + f * 14, 0, Math.PI * 2);
    ctx.stroke();
    for (const spread of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(spread) * 6, Math.sin(spread) * 6);
      ctx.lineTo(Math.cos(spread) * (12 + f * 22), Math.sin(spread) * (12 + f * 22));
      ctx.stroke();
    }
  }
  ctx.restore();
}
// Shield outcomes at the fighter's shield radius.
const GUARD_EFFECTS = { 'perfect-block': 0.35, shieldbreak: 0.6 };
function drawGuardEffect(ctx, e, f) {
  ctx.save();
  ctx.translate(e.x, e.y - 4);
  if (e.type === 'shieldbreak') {
    // The shield shatters: a red flash and shards flying outward.
    ctx.globalAlpha = 0.35 * (1 - f * 3);
    if (f < 1 / 3) {
      ctx.fillStyle = '#ff4a3d';
      ctx.beginPath();
      ctx.arc(0, 0, 29, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1 - f;
    ctx.strokeStyle = '#ff4a3d';
    ctx.lineWidth = 3 * (1 - f) + 1;
    ctx.beginPath();
    ctx.arc(0, 0, 29 + f * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff7a6b';
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 + 0.3,
        dist = 29 + f * (26 + (i % 3) * 9);
      ctx.save();
      ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist);
      ctx.rotate(angle + f * 4);
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(5, 0);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  // A clean flash: two bright rings and a four-point glint.
  ctx.globalAlpha = 1 - f;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3 * (1 - f) + 1;
  ctx.beginPath();
  ctx.arc(0, 0, 29 + f * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ffe9a3';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 33 + f * 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const glint = 10 + 8 * (1 - f);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -glint);
    ctx.lineTo(2, 0);
    ctx.lineTo(-2, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function drawEffects(ctx, attackColors) {
  const now = performance.now();
  for (let i = impactEffects.length - 1; i >= 0; i--) {
    const e = impactEffects[i],
      age = (now - e.born) / 1000,
      duration =
        GUARD_EFFECTS[e.type] ??
        (e.type === 'kill'
          ? 0.65
          : e.type === 'swipe-contact' || e.type === 'shot-break'
            ? 0.22
            : 0.4);
    if (age > duration) {
      impactEffects.splice(i, 1);
      continue;
    }
    if (e.type === 'swipe-contact' || e.type === 'deflect' || e.type === 'shot-break') {
      drawStrike(ctx, e, age / duration, attackColors?.get(e.playerId));
      continue;
    }
    if (GUARD_EFFECTS[e.type]) {
      drawGuardEffect(ctx, e, age / duration);
      continue;
    }
    const f = age / duration,
      color =
        attackColors?.get(e.owner) ||
        e.color ||
        (e.type === 'shieldbreak' ? '#76bcff' : e.type === 'kill' ? '#f574a5' : '#edf8c7');
    ctx.save();
    ctx.globalAlpha = 1 - f;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (e.type === 'teleport') {
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(e.fromX, e.fromY);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(e.fromX, e.fromY, 8 + f * 25, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(e.x, e.y, 7 + f * (e.type === 'kill' ? 52 : 27), 0, Math.PI * 2);
    ctx.stroke();
    for (let j = 0; j < 8; j++) {
      const angle = (j * Math.PI) / 4,
        dist = 12 + f * 45;
      ctx.fillRect(e.x + Math.cos(angle) * dist - 2, e.y + Math.sin(angle) * dist - 2, 4, 4);
    }
    if (e.damage) {
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff5dc';
      ctx.fillText('-' + Math.round(e.damage), e.x, e.y - 35 - f * 24);
    }
    ctx.restore();
  }
}
// The simulation blocks attacks for a few ticks after lowering a shield.
const SHIELD_RELEASE_TICKS = Math.max(SHIELD.release, SHIELD.cooldown),
  SHIELD_PERFECT_TICKS = SHIELD.perfect,
  shieldTransitions = new WeakMap();
function drawShield(ctx, canvas, p, t) {
  let transitions = shieldTransitions.get(canvas);
  if (!transitions) {
    transitions = new Map();
    shieldTransitions.set(canvas, transitions);
  }
  if (p.shielding) {
    transitions.delete(p.id);
    ctx.save();
    ctx.strokeStyle = '#76bcff';
    ctx.fillStyle = '#76bcff19';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 4, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // The perfect-block window: a bright outer ring that closes as it ends.
    if (p.shieldPerfect > 0) {
      const left = Math.min(1, p.shieldPerfect / SHIELD_PERFECT_TICKS);
      ctx.globalAlpha = 0.35 + 0.65 * left;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4, 31 + 4 * left, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (!(p.shieldRelease > 0)) {
    transitions.delete(p.id);
    return;
  }
  // Local gym frames use the exact simulation countdown, including slowed play.
  const remaining = p.shieldRelease;
  const ratio = Math.min(1, remaining / SHIELD_RELEASE_TICKS),
    progress = 1 - ratio,
    radius = 12 + 17 * ratio;
  ctx.save();
  ctx.translate(p.x, p.y - 4);
  ctx.strokeStyle = '#a8dcff';
  ctx.fillStyle = '#def5ff';
  ctx.lineWidth = 1.5 + ratio;
  ctx.globalAlpha = 0.15 + 0.7 * ratio;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + progress * 0.7,
      span = (Math.PI / 2 - 0.22) * ratio;
    ctx.beginPath();
    ctx.arc(0, 0, radius, angle, angle + span);
    ctx.stroke();
    const tip = angle + span;
    ctx.fillRect(Math.cos(tip) * radius - 1, Math.sin(tip) * radius - 1, 2, 2);
  }
  ctx.globalAlpha = 0.2 * ratio;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
export function renderArena(
  canvas,
  state,
  {
    localId = null,
    aim = null,
    labels = true,
    playerAttackColors = false,
    flinchPlayers = new Map(),
    flinchDuration = 6,
  } = {},
) {
  if (!canvas || !state) return;
  const ctx = canvas.getContext('2d'),
    size = arenaSize(state);
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  ctx.imageSmoothingEnabled = false;
  const t = state.tick || 0,
    engineView = getEngineView(state.mechanicsVersion);
  const map = getStateMap(state);
  if (!drawAuthoredMap(ctx, state, t)) {
    drawStage(
      ctx,
      ['industrial', 'glasshouse'].includes(map.theme) ? { ...map, walls: [] } : map,
      t,
      state.mode,
      size,
    );
    drawMapDetails(ctx, state, t);
  }
  drawSurvivalRing(ctx, state);
  drawItems(ctx, state);
  const attackColors = playerAttackColors
    ? new Map(state.players.map((p) => [p.id, p.color]))
    : null;
  engineView.drawTelegraphs?.(ctx, state, attackColors);
  for (const e of state.entities || []) {
    const displayColor = attackColors?.get(e.owner);
    engineView.drawEntity(ctx, e, t, drawCharacter, state, displayColor);
    const core = e.coreColor || e.move?.coreColor || e.color || e.move?.color;
    // Keep the damage cue visible without rewriting any move or simulation value.
    if (displayColor && core && displayColor !== core && !e.actor) {
      ctx.save();
      ctx.fillStyle = core;
      ctx.strokeStyle = '#10190e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const p of state.players || []) {
    if (p.dead) continue;
    if (p.dashTicks) {
      ctx.globalAlpha = 0.2;
      drawCharacter(ctx, p, p.x - p.vx * 2, p.y - p.vy * 2, 3, t);
      ctx.globalAlpha = 1;
    }
    if (p.id === localId) {
      ctx.strokeStyle = '#dcf76b88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 14, 20, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawItemEffects(ctx, p, t);
    const flinch = flinchPlayers.get(p.id) || 0;
    const flash = flinch > 0 && (flinchDuration - flinch) % 4 < 2;
    drawCharacter(
      ctx,
      flash ? { ...p, color: '#ffffff', secondaryColor: '#ffffff' } : p,
      p.x,
      p.y,
      3,
      t,
      labels,
    );
    if (p.hp != null) {
      ctx.fillStyle = '#0e190e';
      ctx.fillRect(p.x - 19, p.y + 23, 38, 5);
      // A custom dark body colour can disappear into the health track. Keep the
      // local fighter's health as readable as the matching HUD meter.
      ctx.fillStyle = p.id === localId ? '#dcf76b' : p.color;
      ctx.fillRect(p.x - 18, p.y + 24, 36 * Math.max(0, Math.min(1, p.hp / (p.maxHp || 100))), 3);
    }
    drawShield(ctx, canvas, p, t);
  }
  if (aim && localId) {
    const p = state.players.find((p) => p.id === localId);
    if (p && !p.dead) {
      ctx.strokeStyle = '#e5f7aa99';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 7, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 12, aim.y);
      ctx.lineTo(aim.x - 4, aim.y);
      ctx.moveTo(aim.x + 4, aim.y);
      ctx.lineTo(aim.x + 12, aim.y);
      ctx.moveTo(aim.x, aim.y - 12);
      ctx.lineTo(aim.x, aim.y - 4);
      ctx.moveTo(aim.x, aim.y + 4);
      ctx.lineTo(aim.x, aim.y + 12);
      ctx.stroke();
    }
  }
  if (localId) {
    drawEffects(ctx, attackColors);
    drawEmotes(ctx, state);
  }
}
export function demoState(t) {
  return {
    stage: 'foundry',
    tick: t,
    mode: 'timed',
    players: [
      {
        id: 'a',
        name: 'YOU',
        color: '#dcf76b',
        look: 'ears',
        x: 330 + Math.sin(t * 0.02) * 44,
        y: 330 + Math.cos(t * 0.017) * 25,
        hp: 82,
      },
      {
        id: 'b',
        name: 'YOUR FRIEND',
        color: '#f574a5',
        look: 'square',
        x: 650 + Math.sin(t * 0.018) * 30,
        y: 300 + Math.cos(t * 0.02) * 50,
        hp: 64,
      },
      {
        id: 'c',
        name: 'WILDCARD',
        color: '#76bcff',
        look: 'round',
        x: 540 + Math.sin(t * 0.015) * 30,
        y: 475 + Math.cos(t * 0.02) * 18,
        hp: 100,
      },
    ],
    entities: [
      {
        id: 1,
        kind: 'projectile',
        x: 390 + ((t * 4) % 210),
        y: 330 - ((t * 4) % 210) * 0.12,
        radius: 10,
        age: 100,
        windup: 0,
        color: '#dcf76b',
        vx: 10,
        vy: 0,
        move: {},
      },
      {
        id: 2,
        kind: 'nova',
        x: 540 + Math.sin(t * 0.015) * 30,
        y: 475 + Math.cos(t * 0.02) * 18,
        radius: 52 + Math.sin(t * 0.08) * 7,
        age: 100,
        windup: 0,
        color: '#76bcff',
        move: {},
      },
      {
        id: 3,
        kind: 'projectile',
        x: 620 - ((t * 3) % 220),
        y: 290 + ((t * 3) % 220) * 0.1,
        radius: 10,
        age: 100,
        windup: 0,
        color: '#f574a5',
        vx: -10,
        vy: 0,
        move: {},
      },
    ],
  };
}
