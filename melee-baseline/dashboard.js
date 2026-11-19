import { defaults, sanitize, tunedMoves, readRaw, playLink } from './tuning.js?v=21';
import { renderScores, openReplay } from './score-view.js?v=21';
import { listRuns, loadRun, saveRun, deleteRun } from './run-history.js?v=19';
import { MAX_GAMES_PER_PAIR, gamesPerPair } from './run-size.js';
const pendingReports = new Map();
let selection = 0;
let reference;
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
  ['hitRadius', 'Player hit-circle radius (units)', null, 1, 40, 1],
  ['flinch', 'Flinch frames', null, 0, 120, 1],
  ['parry', 'Parry release frames', null, 0, 120, 1],
  ['shieldRelease', 'Shield release → attack/dash (frames)', null, 0, 180, 1],
  ['shieldRearm', 'Shield release → shield again (frames)', null, 0, 180, 1],
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
    `${t.difficulty} · ${t.style} · Player radius ${t.hitRadius ?? 13} units · Gun ${t.knockback}× · Flinch ${t.flinch}f · Parry ${t.parry}f · Shield release ${t.shieldRelease ?? 8}f / rearm ${t.shieldRearm ?? 15}f · Swipe cooldown ${t.swipeCooldown}f. ` +
    baseMoves
      .map(
        (m) =>
          `${m.name}: radius ${t.moves[m.name].radius}, windup ${t.moves[m.name].windup}f, cooldown ${t.moves[m.name].cooldown}f`,
      )
      .join(' · ');
}
$('games').max = MAX_GAMES_PER_PAIR;
$('games-range').textContent = '(1–' + MAX_GAMES_PER_PAIR + ')';
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
    games = gamesPerPair($('games').value);
  $('games').value = games;
  $('run').disabled = true;
  $('cancel').disabled = false;
  $('run-status').textContent = `Starting ${games * 3} duels…`;
  $('progress').max = games * 3;
  $('progress').value = 0;
  worker = new Worker(new URL('sim-worker.js?v=21', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      $('progress').value = data.done;
      $('run-status').textContent =
        `Simulating and verifying replays: ${data.done} / ${data.total}`;
    }
    if (data.type === 'complete') {
      const r = data.report;
      const created = Date.now();
      const entry = {
        id: crypto.randomUUID(),
        created,
        label: new Date(created).toLocaleString() + ' · ' + games * 3 + ' games · seed ' + r.seed,
      };
      pendingReports.set(entry.id, r);
      const row = addOption(entry);
      numberRuns();
      row.querySelector('input').checked = true;
      $('history').scrollTop = 0;
      selectRun();
      saveRun(entry, r)
        .then(() => pendingReports.delete(entry.id))
        .catch(() => {
          row.dataset.tabOnly = 'true';
          row.querySelector('span').append(' · tab only');
          if (row.querySelector('input').checked)
            $('history-status').textContent =
              'Browser storage is unavailable. Download this run to keep it.';
        });
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
function numberRuns() {
  const rows = $('history').querySelectorAll('[data-created]');
  rows.forEach((row, i) => {
    row.querySelector('strong').textContent = 'Run ' + (rows.length - i);
  });
}
function addOption(entry) {
  const row = document.createElement('label');
  row.dataset.created = entry.created;
  const radio = document.createElement('input');
  Object.assign(radio, { type: 'radio', name: 'history-run', value: entry.id });
  const details = document.createElement('span');
  details.textContent = entry.label;
  row.append(radio, document.createElement('strong'), details);
  const next = Array.from($('history').children).find(
    (other) => !other.dataset.created || Number(other.dataset.created) <= entry.created,
  );
  $('history').insertBefore(row, next || null);
  return row;
}
async function selectRun() {
  const token = ++selection;
  const id = $('history').querySelector('input:checked').value;
  $('delete-run').disabled = id === 'reference';
  report = null;
  $('download').disabled = true;
  $('scores').replaceChildren();
  $('run-settings').textContent = '';
  $('history-status').textContent = 'Loading results…';
  try {
    let r = pendingReports.get(id);
    if (!r && id === 'reference') {
      reference ??= fetch('../melee-moderate-defense/report.json')
        .then((response) => {
          if (!response.ok) throw Error();
          return response.json();
        })
        .catch((error) => {
          reference = null;
          throw error;
        });
      r = await reference;
    } else if (!r) r = await loadRun(id);
    if (token !== selection) return;
    show(r, 'Results');
    $('history-status').textContent = '';
  } catch {
    if (token === selection) $('history-status').textContent = 'Could not load this run.';
  }
}
$('history').onchange = selectRun;
$('delete-run').onclick = async () => {
  const radio = $('history').querySelector('input:checked');
  if (!radio || radio.value === 'reference') return;
  const row = radio.closest('label');
  if (
    !confirm(
      'Delete ' + row.querySelector('strong').textContent + ' and its replays from this browser?',
    )
  )
    return;
  $('delete-run').disabled = true;
  try {
    if (!row.dataset.tabOnly) await deleteRun(radio.value);
    pendingReports.delete(radio.value);
    const next = row.nextElementSibling || row.previousElementSibling;
    const selected = radio.checked;
    row.remove();
    numberRuns();
    if (selected) {
      next.querySelector('input').checked = true;
      selectRun();
    }
  } catch {
    if (radio.checked) {
      $('history-status').textContent = 'Could not delete this run. Please try again.';
      $('delete-run').disabled = false;
    }
  }
};
const initialSelection = selection;
try {
  for (const entry of await listRuns()) addOption(entry);
  numberRuns();
} catch {}
if (selection === initialSelection) {
  $('history').querySelector('input').checked = true;
  selectRun();
}
