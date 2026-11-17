import * as engine from '../shared/sim/composed/engine.js';
import { renderArena, receiveEffects } from './renderer.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { receiveInput, consumeInput } from './gym-input-buffer.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pair = Math.max(1, Math.min(3, Math.floor(Number(params.get('pair'))) || 1));
const side = params.get('side') === 'b' ? 'b' : 'a';
const enemy = side === 'a' ? 'b' : 'a';
const styles = ['balanced', 'aggressive', 'ranged-strafing', 'defensive'];
let style = styles.includes(params.get('style')) ? params.get('style') : 'balanced';
let seed = Number(params.get('seed')) >>> 0 || 240914294;
const moves = await fetch(new URL('../../moves.json', import.meta.url)).then((r) => {
  if (!r.ok) throw Error('Move definitions could not be loaded. Please reload.');
  return r.json();
});
const matchup = [
  [0, 1],
  [0, 2],
  [1, 2],
][pair - 1].map((i) => moves[i]);
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
    hotkeys: ['KeyV'],
    builtinHotkeys: { dash: 'Space', shield: 'ShiftLeft', shoot: 'Mouse0', swipe: 'KeyC' },
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
  for (const [key, value] of Object.entries({ pair, side, style, seed }))
    url.searchParams.set(key, value);
  history.replaceState(null, '', url);
  url.searchParams.set('side', enemy);
  $('switch').href = url;
}
function start() {
  controls.clearControls();
  controls.resetPresses();
  packet = null;
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
  renderArena(canvas, state, { localId: side, aim: controls.aim });
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
      const bar = document.createElement('progress');
      bar.max = p.maxHp;
      bar.value = p.dead ? 0 : p.hp;
      bar.setAttribute('aria-label', p.name + ' health');
      card.append(name, info, bar);
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
    `V / 1: ${matchup[side === 'a' ? 0 : 1].name} · ${cooldown ? 'cooldown ' + (cooldown / 30).toFixed(1) + 's' : 'ready'} · Enemy: ${style}`;
}
$('style').addEventListener('change', () => {
  style = $('style').value;
  updateUrl();
  controls.clearControls();
  canvas.focus();
  draw();
});
$('restart').addEventListener('click', start);
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
    accumulated += elapsed;
    while (accumulated >= 1000 / 30 && !state.ended) {
      const now = performance.now();
      packet = receiveInput(packet, controls.currentInput(), now);
      controls.acknowledge(packet.ack);
      const previous = { tick: state.tick, ended: state.ended };
      engine.step(state, {
        [side]: consumeInput(packet, now),
        [enemy]: engine.botInput(state, enemy, { movementStyle: style }),
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
