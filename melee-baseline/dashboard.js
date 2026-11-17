import { defaults, sanitize, tunedMoves, readRaw, playLink } from './tuning.js';
import { renderScores, openReplay } from './score-view.js';
const $ = (id) => document.getElementById(id),
  baseMoves = await fetch('moves.json').then((r) => r.json()),
  KEY = 'rando-gym-tuning-v1';
let saved = {};
try {
  saved = readRaw(localStorage.getItem(KEY));
} catch {}
let tuning = sanitize(
    baseMoves,
    new URLSearchParams(location.search).has('tune')
      ? readRaw(new URLSearchParams(location.search).get('tune'))
      : saved,
  ),
  report,
  worker;
const specs = [
  ['difficulty', 'Bot difficulty', ['moderate', 'hard', 'impossible', 'normal']],
  ['style', 'Movement', ['balanced', 'aggressive', 'ranged-strafing', 'defensive', 'stationary']],
  ['speed', 'Play speed', [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]],
  ['knockback', 'Gun knockback ×', null, 0, 10, 0.5],
  ['flinch', 'Flinch frames', null, 0, 120, 1],
  ['parry', 'Parry release frames', null, 0, 120, 1],
  ['swipeCooldown', 'Swipe cooldown frames', null, 0, 180, 1],
];
function build() {
  const controls = $('shared-controls');
  for (const [key, label, choices, min, max, step] of specs) {
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement(choices ? 'select' : 'input');
    input.id = 'tune-' + key;
    if (choices)
      for (const v of choices) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent =
          key === 'speed'
            ? v === 0.75
              ? 'Normal (0.75×)'
              : v === 1
                ? 'Fast (1×)'
                : v + '×'
            : key === 'style' && v === 'stationary'
              ? 'Stand still'
              : String(v)[0].toUpperCase() + String(v).slice(1);
        input.append(o);
      }
    else Object.assign(input, { type: 'number', min, max, step });
    l.append(input);
    controls.append(l);
  }
  const l = document.createElement('label');
  l.innerHTML =
    '<span>Overlay</span><span><input type="checkbox" id="tune-hitboxes"> Player hit circles</span>';
  controls.append(l);
  baseMoves.forEach((m, i) => {
    const card = document.createElement('section');
    card.className = 'move-tune';
    const h = document.createElement('h2');
    h.textContent = m.name;
    card.append(h);
    const root = m.templates.find((t) => t.id === m.root);
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = `${root.damage.amount} HP per hit · ${root.lifetime} active frames · ${root.geometry[0].kind} shape`;
    card.append(info);
    const grid = document.createElement('div');
    grid.className = 'move-fields';
    for (const [key, label, min, max] of [
      ['radius', root.geometry[0].kind === 'capsule' ? 'Blade radius' : 'Hit radius', 1, 100],
      ['windup', 'Windup frames', 0, 30],
      ['cooldown', 'Cooldown frames', 3, 180],
    ]) {
      const l = document.createElement('label');
      l.textContent = label;
      const input = document.createElement('input');
      Object.assign(input, { type: 'number', min, max, step: 1, id: `move-${i}-${key}` });
      l.append(input);
      grid.append(l);
    }
    card.append(grid);
    $('moves').append(card);
  });
  for (let i = 0; i < 3; i++) {
    const pair = [
        [0, 1],
        [0, 2],
        [1, 2],
      ][i],
      card = document.createElement('section');
    card.className = 'move-tune';
    const h = document.createElement('h2');
    h.textContent = pair.map((j) => baseMoves[j].name).join(' vs ');
    const links = document.createElement('div');
    links.className = 'play-links';
    links.dataset.links = i;
    card.append(h, links);
    $('play-links').append(card);
  }
}
function fill() {
  for (const [key] of specs) $('tune-' + key).value = tuning[key];
  $('tune-hitboxes').checked = tuning.hitboxes;
  baseMoves.forEach((m, i) => {
    for (const key of ['radius', 'windup', 'cooldown'])
      $(`move-${i}-${key}`).value = tuning.moves[m.name][key];
  });
  updateLinks();
}
function updateLinks() {
  for (let i = 0; i < 3; i++) {
    const pair = [
      [0, 1],
      [0, 2],
      [1, 2],
    ][i];
    const box = document.querySelector(`[data-links="${i}"]`);
    box.replaceChildren();
    for (let seat = 0; seat < 2; seat++) {
      const a = document.createElement('a');
      a.href = playLink(i + 1, seat ? 'b' : 'a', tuning);
      a.textContent = 'Play ' + baseMoves[pair[seat]].name;
      a.onclick = (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        const d = $('replay-dialog');
        d.querySelector('.replay-title').textContent = a.textContent;
        const f = d.querySelector('iframe');
        f.onload = null;
        f.src = a.href;
        d.showModal();
      };
      box.append(a);
    }
  }
}
function readForm() {
  const raw = { moves: {} };
  for (const [key, , ,] of specs)
    raw[key] = ['difficulty', 'style'].includes(key)
      ? $('tune-' + key).value
      : Number($('tune-' + key).value);
  raw.hitboxes = $('tune-hitboxes').checked;
  baseMoves.forEach((m, i) => {
    raw.moves[m.name] = {};
    for (const key of ['radius', 'windup', 'cooldown'])
      raw.moves[m.name][key] = Number($(`move-${i}-${key}`).value);
  });
  tuning = sanitize(baseMoves, raw);
  fill();
  try {
    localStorage.setItem(KEY, JSON.stringify(tuning));
  } catch {}
  const url = new URL(location.href);
  url.searchParams.set('tune', JSON.stringify(tuning));
  history.replaceState(null, '', url);
  if (report) $('run-status').textContent = 'Parameters changed. Run again to update scores.';
}
function show(r, label) {
  report = r;
  $('result-heading').textContent = label;
  renderScores($('scores'), r, (g, title) =>
    openReplay($('replay-dialog'), g.game, title, r.tuning || defaults(baseMoves)),
  );
  $('download').disabled = false;
  const t = r.tuning || defaults(baseMoves);
  $('run-settings').textContent =
    `${t.difficulty} · ${t.style} · Gun ${t.knockback}× · Flinch ${t.flinch}f · Parry ${t.parry}f · Swipe cooldown ${t.swipeCooldown}f. ` +
    baseMoves
      .map(
        (m) =>
          `${m.name}: radius ${t.moves[m.name].radius}, windup ${t.moves[m.name].windup}f, cooldown ${t.moves[m.name].cooldown}f`,
      )
      .join(' · ');
}
build();
fill();
$('settings').onchange = readForm;
$('settings').onsubmit = (event) => event.preventDefault();
$('reset').onclick = () => {
  tuning = defaults(baseMoves);
  fill();
  readForm();
};
$('run').onclick = () => {
  worker?.terminate();
  const captured = structuredClone(tuning),
    games = Math.max(1, Math.min(100, Math.round(Number($('games').value)) || 24));
  $('games').value = games;
  $('run').disabled = true;
  $('cancel').disabled = false;
  $('run-status').textContent = `Starting ${games * 3} duels…`;
  $('progress').max = games * 3;
  $('progress').value = 0;
  worker = new Worker(new URL('sim-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      $('progress').value = data.done;
      $('run-status').textContent =
        `Simulating and verifying replays: ${data.done} / ${data.total}`;
    }
    if (data.type === 'complete') {
      show(data.report, 'Your simulated scores');
      $('run-status').textContent =
        `${games * 3} games finished; all replays verified. Scores use the settings captured at start.`;
      end();
    }
    if (data.type === 'error') {
      $('run-status').textContent = data.message;
      end();
    }
  };
  worker.onerror = (e) => {
    $('run-status').textContent = e.message || 'Simulation failed';
    end();
  };
  worker.postMessage({
    moves: baseMoves,
    tuning: captured,
    games,
    seed: Number.isFinite(Number($('seed').value))
      ? Math.max(0, Math.min(4294967295, Math.trunc(Number($('seed').value))))
      : 240913285,
  });
};
function end() {
  worker?.terminate();
  worker = null;
  $('run').disabled = false;
  $('cancel').disabled = true;
}
$('cancel').onclick = () => {
  end();
  $('run-status').textContent = 'Run cancelled.';
};
$('download').onclick = () => {
  const u = URL.createObjectURL(new Blob([JSON.stringify(report)], { type: 'application/json' })),
    a = document.createElement('a');
  a.href = u;
  a.download = 'gym-run.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
$('close-replay').onclick = () => $('replay-dialog').close();
$('replay-dialog').onclose = () => {
  $('replay-dialog').querySelector('iframe').src = 'about:blank';
};
try {
  show(
    await fetch('../melee-moderate-defense/report.json').then((r) => r.json()),
    'Published reference run · default settings',
  );
} catch {
  $('run-status').textContent = 'Choose parameters and start a run.';
}
