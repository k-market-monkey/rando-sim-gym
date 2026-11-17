import * as engine from './gym-engine.js?v=shield-hitboxes10';
import { parryRemaining } from './gym-parry.js?v=shield-hitboxes10';
import { createGymCombat } from './gym-combat.js?v=shield-hitboxes10';

import { renderArena, receiveEffects, shieldVisualState } from './gym-renderer.js';
import { createInput } from './gym-input.js';
import { createAudio } from './audio.js';
import { receiveInput, consumeInput } from './gym-input-buffer.js';

const combat = createGymCombat();

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pair = Math.max(1, Math.min(3, Math.floor(Number(params.get('pair'))) || 1));
const side = params.get('side') === 'b' ? 'b' : 'a';
const enemy = side === 'a' ? 'b' : 'a';
const styles = ['balanced', 'aggressive', 'ranged-strafing', 'defensive', 'stationary'];
let style = styles.includes(params.get('style')) ? params.get('style') : 'balanced';
let seed = Number(params.get('seed')) >>> 0 || 240914294;
const speeds = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
let speed = speeds.includes(Number(params.get('speed'))) ? Number(params.get('speed')) : 1;
const moves = await fetch(new URL('../../moves.json', import.meta.url)).then((r) => {
  if (!r.ok) throw Error('Move definitions could not be loaded. Please reload.');
  return r.json();
});
const matchup = [
  [0, 1],
  [0, 2],
  [1, 2],
][pair - 1].map((i) => moves[i]);
const bounded = (value, fallback, maximum) =>
  value !== null && Number.isFinite(Number(value))
    ? Math.max(0, Math.min(maximum, Number(value)))
    : fallback;
let knockbackMultiplier = bounded(params.get('knockback'), 3, 10);
let flinchFrames = Math.round(bounded(params.get('flinch'), 0, 120));
let parryFrames = Math.round(bounded(params.get('parry'), 6, 120));
combat.configure({ knockbackMultiplier, flinchFrames, parryFrames });
let showHitboxes = params.get('hitboxes') === '1';
const canvas = $('game-canvas');
let state,
  room,
  packet,
  round = 0,
  accumulated = 0,
  previousTime = 0;
const audio = createAudio();
audio.mountToggle($('sound'));
const controls = createInput({
  context: () => ({
    view: 'match',
    state,
    id: side,
    room,
    round: { engine: 'composed' },
    hotkeys: ['KeyC'],
    builtinHotkeys: { dash: 'Space', shield: 'ShiftLeft', shoot: 'Mouse0', swipe: 'Mouse2' },
    open: true,
    dockOpen: false,
  }),
  send: (type, data) => {
    if (type === 'pause') setPaused(data.paused);
    if (type === 'input') packet = receiveInput(packet, data.input, performance.now());
  },
  ensureAudio: () => audio.ensure(),
  hotkeyCapture: {
    active: () => false,
    keydown: () => false,
    cancel: () => {},
    focusChanged: () => {},
  },
  closeDock: () => {},
});
controls.install();
controls.bindCanvas(canvas);
function updateUrl() {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({
    pair,
    side,
    style,
    seed,
    speed,
    knockback: knockbackMultiplier,
    flinch: flinchFrames,
    parry: parryFrames,
    hitboxes: showHitboxes ? 1 : 0,
  }))
    url.searchParams.set(key, value);
  history.replaceState(null, '', url);
  url.searchParams.set('side', enemy);
  $('switch').href = url;
}
function start() {
  controls.clearControls();
  controls.resetPresses();
  packet = null;
  combat.reset();
  accumulated = 0;
  const players = matchup.map((move, index) => ({
    id: index ? 'b' : 'a',
    name: (index === (side === 'b' ? 1 : 0) ? 'You · ' : 'Bot · ') + move.name,
    color: index ? '#f574a5' : '#78f0c5',
    loadout: [move],
  }));
  state = engine.createMatch({
    seed,
    mode: 'simulation',
    players,
    swipeEnabled: true,
    shootEnabled: true,
  });
  room = {
    code: 'GYM',
    phase: 'playing',
    roundNumber: ++round,
    roundPlayers: players.map((player) => ({
      ...player,
      loadout: player.loadout.map((move) => move.name),
    })),
    inputRevision: 0,
    pauseControllerId: side,
    paused: true,
  };
  controls.captureRoundBindings();
  $('title').textContent = `${matchup[0].name} vs ${matchup[1].name}`;
  $('style').value = style;
  $('hitboxes').checked = showHitboxes;
  $('speed').value = String(speed);
  $('knockback').value = String(knockbackMultiplier);
  $('flinch').value = String(flinchFrames);
  $('parry').value = String(parryFrames);
  $('flinch-seconds').textContent = (flinchFrames / 30).toFixed(2) + 's';
  updateUrl();
  draw();
  canvas.focus();
}
function setPaused(paused) {
  room.paused = paused;
  accumulated = 0;
  if (paused) controls.clearControls();
  else {
    audio.ensure();
    canvas.focus();
  }
  draw();
}
function draw() {
  renderArena(canvas, state, { localId: side, aim: controls.aim, showHitboxes });
  $('pause').textContent = state.ended
    ? 'Finished'
    : room.paused
      ? state.tick
        ? 'Resume'
        : 'Start'
      : 'Pause';
  $('pause').disabled = state.ended;
  $('score').replaceChildren(
    ...state.players.map((p) => {
      const card = document.createElement('div');
      card.className = 'fighter';
      card.style.setProperty('--color', p.color);
      const name = document.createElement('strong');
      name.textContent = p.name;
      const info = document.createElement('div');
      info.textContent = `${p.deaths} deaths · ${p.dead ? 'Respawning' : Math.round(p.hp) + ' / ' + p.maxHp + ' HP'}`;
      if (parryRemaining(state, p))
        info.textContent += ` · Parry counter ${parryRemaining(state, p)}f`;
      if (combat.remaining(p.id)) info.textContent += ` · Flinch ${combat.remaining(p.id)}f`;
      const bar = document.createElement('progress');
      bar.max = p.maxHp;
      bar.value = p.dead ? 0 : p.hp;
      bar.setAttribute('aria-label', p.name + ' health');
      const guard = document.createElement('div');
      guard.className = 'shield-state';
      const visual = shieldVisualState(p);
      guard.textContent = visual.label;
      guard.style.color = visual.blocked ? '#f2c56b' : '#a8dcff';
      card.append(name, info, bar, guard);
      return card;
    }),
  );
  $('status').textContent = state.ended
    ? (state.winner === null ? 'Draw' : state.winner === side ? 'You win' : 'Bot wins') +
      ' · Restart to try again.'
    : room.paused
      ? state.tick
        ? 'Paused · Click the arena or press Esc to resume.'
        : 'Ready · Click the arena or Start to play.'
      : `${Math.max(0, (750 - state.tick) / 30).toFixed(1)}s remaining`;
  const human = state.players.find((p) => p.id === side);
  const cooldown = human.moveResources?.[matchup[side === 'a' ? 0 : 1].name]?.cooldown || 0;
  $('ability').textContent =
    `C / 1: ${matchup[side === 'a' ? 0 : 1].name} · ${cooldown ? 'cooldown ' + (cooldown / 30).toFixed(1) + 's' : 'ready'} · Swipe (right-click / X): ${human.swipeCooldown ? (human.swipeCooldown / 30).toFixed(1) + 's' : 'ready'} · Enemy: ${style}`;
}
function enemyInput() {
  const input = engine.botInput(state, enemy, {
    movementStyle: style === 'stationary' ? 'balanced' : style,
  });
  return style === 'stationary' ? { ...input, x: 0, y: 0, dash: false } : input;
}
$('hitboxes').addEventListener('change', () => {
  showHitboxes = $('hitboxes').checked;
  updateUrl();
  controls.clearControls();
  canvas.focus();
  draw();
});
$('style').addEventListener('change', () => {
  style = $('style').value;
  updateUrl();
  controls.clearControls();
  canvas.focus();
  draw();
});
function restart() {
  const resume = state.ended || !room.paused;
  start();
  if (resume) setPaused(false);
}
$('restart').addEventListener('click', restart);
for (const id of ['knockback', 'flinch', 'parry'])
  $(id).addEventListener('change', () => {
    knockbackMultiplier = bounded($('knockback').value, 3, 10);
    flinchFrames = Math.round(bounded($('flinch').value, 0, 120));
    parryFrames = Math.round(bounded($('parry').value, 6, 120));
    $('parry').value = String(parryFrames);
    $('knockback').value = String(knockbackMultiplier);
    $('flinch').value = String(flinchFrames);
    $('parry').value = String(parryFrames);
    $('flinch-seconds').textContent = (flinchFrames / 30).toFixed(2) + 's';
    combat.configure({ knockbackMultiplier, flinchFrames, parryFrames });
    updateUrl();
    controls.clearControls();
    canvas.focus();
    draw();
  });
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyR' ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  )
    return;
  event.preventDefault();
  restart();
});
$('speed').addEventListener('change', () => {
  speed = Number($('speed').value);
  accumulated = 0;
  updateUrl();
  controls.clearControls();
  canvas.focus();
});
$('new-game').addEventListener('click', () => {
  seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  start();
});
$('pause').addEventListener('click', () => setPaused(!room.paused));
canvas.addEventListener('pointerdown', () => {
  if (!state.ended) setPaused(false);
});
window.addEventListener('blur', () => {
  if (room && !state.ended) setPaused(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && room && !state.ended) setPaused(true);
});
start();
function frame(time) {
  const elapsed = Math.min(250, time - (previousTime || time));
  previousTime = time;
  if (!room.paused && !state.ended) {
    accumulated += elapsed * speed;
    while (accumulated >= 1000 / 30 && !state.ended) {
      const now = performance.now();
      packet = receiveInput(packet, controls.currentInput(), now);
      controls.acknowledge(packet.ack);
      const previous = { tick: state.tick, ended: state.ended };
      combat.step(state, {
        [side]: consumeInput(packet, now),
        [enemy]: enemyInput(),
      });
      receiveEffects(state.events);
      audio.playState(state, previous, side);
      accumulated -= 1000 / 30;
    }
    draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
