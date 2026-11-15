import { WIDTH, HEIGHT } from '../shared/content/arena.js';
import { renderArena, receiveEffects } from './renderer.js';
import { createAudio } from './audio.js';
import { loadPreferences, savePreferences } from './preferences.js';
import { MAP_CATALOG } from '../shared/content/maps/catalog.js';
import { objectiveMarkup } from './objective-hud.js';
import { settingLabels } from './room-settings-form.js';
import {
  createReplayPlayer,
  replayEnginePath,
  replayTime,
  REPLAY_TICK_RATE,
} from './replay-player.js';

const $ = (id) => document.getElementById(id),
  preferences = loadPreferences(),
  audio = createAudio({
    enabled: preferences.sound,
    persist(enabled) {
      // A different tab may have saved its loadout while this replay was open.
      const latest = loadPreferences();
      savePreferences({ ...latest, sound: enabled });
    },
  }),
  modeNames = settingLabels('mode');
audio.mountToggle($('audio-toggle'));
$('replay-canvas').width = WIDTH;
$('replay-canvas').height = HEIGHT;
let player,
  replay,
  lastFrame,
  failed = false;
const scoreElements = new Map();

function showError(message) {
  failed = true;
  player?.pause();
  $('replay-loading').hidden = false;
  $('replay-loading').textContent = message;
}

function draw() {
  const state = player.state,
    following = $('replay-follow').value;
  renderArena($('replay-canvas'), state, {
    localId: following || null,
    aim: null,
    labels: true,
    playerAttackColors: replay.round?.playerAttackColors === true,
  });
  let objectives = $('objective-hud');
  if (!objectives) {
    objectives = document.createElement('div');
    objectives.id = 'objective-hud';
    $('replay-canvas').after(objectives);
  }
  objectives.innerHTML = objectiveMarkup(state, following);
  $('replay-seek').value = player.tick;
  $('replay-seek').setAttribute(
    'aria-valuetext',
    `${replayTime(player.tick / REPLAY_TICK_RATE)} of ${replayTime(player.total / REPLAY_TICK_RATE)}`,
  );
  $('replay-position').textContent =
    `${replayTime(player.tick / REPLAY_TICK_RATE)} / ${replayTime(player.total / REPLAY_TICK_RATE)}`;
  $('replay-tick').textContent = String(player.tick);
  $('replay-hash').textContent = player.hash;
  const finished = player.tick === player.total;
  $('replay-state').textContent = finished ? 'Finished' : player.playing ? 'Playing' : 'Paused';
  $('replay-toggle').textContent = player.playing ? 'Pause' : finished ? 'Play again' : 'Play';
  $('replay-toggle').setAttribute(
    'aria-label',
    player.playing ? 'Pause replay' : finished ? 'Play replay again' : 'Play replay',
  );
  for (const fighter of state.players) {
    const row = scoreElements.get(fighter.id);
    if (!row) continue;
    row.element.classList.toggle('is-followed', fighter.id === following);
    row.score.textContent =
      state.mode === 'lives'
        ? `${fighter.lives} lives`
        : state.mode === 'hill'
          ? `${Math.floor(fighter.score / REPLAY_TICK_RATE)} points`
          : state.mode === 'ctf'
            ? `${fighter.score} captures`
            : `${fighter.score} kills`;
  }
  const fighter = state.players.find((entry) => entry.id === following);
  $('replay-follow-status').textContent = fighter
    ? `Following ${fighter.name} · ${fighter.dead ? 'Out' : `${Math.ceil(fighter.hp)} / ${fighter.maxHp} health`}`
    : 'Showing all players.';
  $('replay-result').hidden = !finished;
}

function action(run) {
  if (!player || failed) return;
  try {
    run();
    draw();
  } catch {
    showError('Playback could not continue. Reload the page to try again.');
  }
}

function toggle() {
  if (player.playing) player.pause();
  else {
    audio.ensure();
    if (player.tick === player.total) player.seek(0);
    player.play();
    lastFrame = undefined;
  }
}
$('replay-toggle').addEventListener('click', () => action(toggle));
$('replay-seek').addEventListener('input', () =>
  action(() => player.seek(Number($('replay-seek').value))),
);
$('replay-speed').addEventListener('change', () =>
  action(() => player.setSpeed(Number($('replay-speed').value))),
);
$('replay-follow').addEventListener('change', () => action(() => {}));
document.addEventListener('keydown', (event) => {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target.closest('input, select, textarea, button, a, [contenteditable="true"]')
  )
    return;
  if (!['Space', 'ArrowLeft', 'ArrowRight'].includes(event.code) || !player || failed) return;
  event.preventDefault();
  action(() => {
    if (event.code === 'Space') {
      if (!event.repeat) toggle();
    } else player.seek(player.tick + (event.code === 'ArrowLeft' ? -5 : 5) * REPLAY_TICK_RATE);
  });
});
document.addEventListener('visibilitychange', () => {
  lastFrame = undefined;
});

function frame(now) {
  if (failed) return;
  action(() => {
    if (lastFrame !== undefined && !document.hidden) player.advance(now - lastFrame);
    lastFrame = now;
  });
  requestAnimationFrame(frame);
}

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id || !/^r-[0-9]{8}-[a-f0-9]{24}$/.test(id))
    throw new Error('Choose a replay from the recent replays page.');
  const response = await fetch(`/api/replays/${encodeURIComponent(id)}`);
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'This replay is unavailable. It may have expired or been removed.'
        : 'The replay could not be loaded. Please try again.',
    );
  replay = await response.json();
  if (replay?.replay !== 1 || replay.id !== id || !Array.isArray(replay.round?.players))
    throw new Error('This replay has an unsupported recording format.');
  const manifestResponse = await fetch('/rando-sim-gym/shared/sim/builds.json', { cache: 'no-cache' });
  if (!manifestResponse.ok)
    throw new Error('The replay engine could not be loaded. Please try again.');
  const path = replayEnginePath(await manifestResponse.json(), replay.game?.engineBuild);
  let engine;
  try {
    engine = await import(path);
  } catch {
    throw new Error('This replay needs a version of the game that is no longer available.');
  }
  player = createReplayPlayer(engine, replay.game, {
    onMismatch({ tick }) {
      $('replay-mismatch').hidden = false;
      $('replay-mismatch').textContent =
        `Playback differs from the recording at tick ${tick}. You can keep watching.`;
      fetch(`/api/replays/${encodeURIComponent(id)}/mismatch`, { method: 'POST' }).catch(() => {});
    },
    onStep(state, previous) {
      audio.playState(state, previous, $('replay-follow').value || null);
      receiveEffects(state.events);
    },
  });
  const round = replay.round,
    map = MAP_CATALOG.find((entry) => entry.id === round.stage)?.name || round.stage || 'Arena',
    endedAt = new Date(replay.endedAt);
  document.title = `${map} replay — RANDO`;
  $('replay-title').textContent = `${map} · ${modeNames[round.mode] || round.mode || 'Match'}`;
  $('replay-region').textContent = `Replay · ${replay.region || 'This server'}`;
  $('replay-meta').textContent =
    `${Number.isFinite(endedAt.getTime()) ? endedAt.toLocaleString() : ''} · ${round.players.length} players · ${replayTime(player.total / REPLAY_TICK_RATE)}`;
  $('replay-build').textContent = replay.game.engineBuild;
  $('replay-final-hash').textContent = replay.game.final.hash;
  $('replay-seek').max = player.total;
  for (const fighter of round.players) {
    const option = document.createElement('option');
    option.value = fighter.id;
    option.textContent = fighter.name;
    $('replay-follow').append(option);
    const element = document.createElement('li'),
      name = document.createElement('span'),
      score = document.createElement('strong');
    name.textContent = fighter.name;
    element.append(name, score);
    $('replay-players').append(element);
    scoreElements.set(fighter.id, { element, score });
  }
  const winners = round.players.filter((fighter) => replay.result?.winners?.includes(fighter.id));
  $('replay-result').textContent = winners.length
    ? `${winners.map((fighter) => fighter.name).join(' + ')} won.`
    : 'The round ended in a draw.';
  $('replay-loading').hidden = true;
  $('replay-viewer').hidden = false;
  draw();
  requestAnimationFrame(frame);
}
load().catch((error) =>
  showError(error instanceof Error ? error.message : 'The replay could not be loaded.'),
);
