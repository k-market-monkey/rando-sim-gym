import { weaponFields } from './weapon-settings.js';
import { CHARACTER_LOOKS } from './human18/shared/content/characters.js';
import { drawHitCircle } from './human19/app/hit-overlay.js';
import { drawCharacter } from './human18/app/gym-base-renderer.js';
import { defaults, sanitize, readRaw, playLink } from './tuning.js?v=29';
import { renderScores, openReplay } from './score-view.js?v=30';
import { listRuns, loadRun, saveRun, deleteRun } from './run-history.js?v=19';
import { MAX_GAMES_PER_PAIR, gamesPerPair } from './run-size.js';
import { settingField, overrides } from './setting-fields.js';
import { MATCHUPS, orderedPair } from './matchups.js';
const pendingReports = new Map();
let selection = 0;
let reference;
const $ = (id) => document.getElementById(id),
  baseMoves = await fetch('moves.json').then((r) => r.json()),
  KEY = 'rando-gym-tuning-v1';
const baseline = defaults(baseMoves);
const runDefaults = { games: 24, seed: 240913285 };
const fields = [];
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
  ['shape', 'Fighter shape', CHARACTER_LOOKS.map((look) => look.id)],
  ['hitRadius', 'Player hit-circle radius (units)', null, 1, 40, 1],
  ['flinch', 'Flinch frames', null, 0, 120, 1],
  ['parry', 'Parry release frames', null, 0, 120, 1],
  ['shieldRelease', 'Shield release → attack/dash (frames)', null, 0, 180, 1],
  ['shieldRearm', 'Shield release → shield again (frames)', null, 0, 180, 1],
  ['swipeCooldown', 'Swipe cooldown frames', null, 0, 180, 1],
];
function refreshFields() {
  const count = fields.filter((update) => update()).length;
  $('override-count').textContent = count
    ? count + (count === 1 ? ' override' : ' overrides')
    : 'All defaults';
  $('reset').disabled = count === 0;
}
function storeSettings() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...overrides(tuning, baseline),
        ...overrides(
          { games: Number($('games').value), seed: Number($('seed').value) },
          runDefaults,
        ),
      }),
    );
  } catch {}
}
function build() {
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
    const group = ['shape', 'hitRadius'].includes(key)
      ? 'body-fields'
      : ['difficulty', 'style', 'speed'].includes(key)
        ? 'shared-controls'
        : 'combat-fields';
    if (key === 'shape')
      for (const option of input.options)
        option.textContent = CHARACTER_LOOKS.find((look) => look.id === option.value).label;
    $(group).append(l);
    fields.push(settingField(input, baseline[key], label));
  }
  const l = document.createElement('label');
  l.innerHTML =
    '<span>Overlay</span><span><input type="checkbox" id="tune-hitboxes"> Player hit circles</span>';
  $('body-fields').append(l);
  fields.push(settingField($('tune-hitboxes'), baseline.hitboxes, 'player hit circles'));
  baseMoves.forEach((m, i) => {
    const card = document.createElement('section');
    card.className = 'move-tune';
    card.hidden = i !== 0;
    $('weapon').add(new Option(m.name, String(i)));
    const grid = document.createElement('div');
    grid.className = 'move-fields';
    for (const { key, label, min, max, step } of weaponFields(m)) {
      const l = document.createElement('label');
      l.textContent = label;
      const input = document.createElement('input');
      Object.assign(input, { type: 'number', min, max, step, id: `move-${i}-${key}` });
      l.append(input);
      grid.append(l);
      fields.push(settingField(input, baseline.moves[m.name][key], m.name + ' ' + label));
    }
    card.append(grid);
    $('moves').append(card);
  });
  $('weapon').onchange = () => {
    Array.from($('moves').children).forEach((card, i) => {
      card.hidden = i !== $('weapon').selectedIndex;
    });
  };
  for (let i = 0; i < 3; i++) {
    const pair = MATCHUPS[i],
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
    for (const { key } of weaponFields(m)) $(`move-${i}-${key}`).value = tuning.moves[m.name][key];
  });
  const ctx = $('shape-preview').getContext('2d');
  ctx.clearRect(0, 0, 100, 100);
  drawCharacter(ctx, { look: tuning.shape, color: '#78f0c5' }, 50, 50, 3);
  drawHitCircle(ctx, 50, 50, tuning.hitRadius);
  refreshFields();
  updateLinks();
}
function updateLinks() {
  for (let i = 0; i < 3; i++) {
    const pair = MATCHUPS[i];
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
    raw[key] = ['difficulty', 'style', 'shape'].includes(key)
      ? $('tune-' + key).value
      : Number($('tune-' + key).value);
  raw.hitboxes = $('tune-hitboxes').checked;
  baseMoves.forEach((m, i) => {
    raw.moves[m.name] = {};
    for (const { key } of weaponFields(m))
      raw.moves[m.name][key] = Number($(`move-${i}-${key}`).value);
  });
  tuning = sanitize(baseMoves, raw);
  fill();
  storeSettings();
  const url = new URL(location.href);
  url.searchParams.set('tune', JSON.stringify(tuning));
  history.replaceState(null, '', url);
  if (report) $('run-status').textContent = 'Parameters changed. Run again to update scores.';
}
function show(r, label) {
  report = { ...r, pairs: r.pairs.map(orderedPair) };
  $('result-heading').textContent = label;
  renderScores($('scores'), report, (g, title, moves) =>
    openReplay($('replay-dialog'), g.game, title, r.tuning || defaults(baseMoves), moves),
  );
  $('download').disabled = false;
  const header = r.pairs[0].games[0].game.header;
  const t = sanitize(baseMoves, { hitRadius: header.hitRadius ?? 13, ...r.tuning });
  $('run-settings').textContent =
    `${t.difficulty} · ${t.style} · ${CHARACTER_LOOKS.find((look) => look.id === t.shape).label} · Player radius ${t.hitRadius} units · Gun ${t.knockback}× · Flinch ${t.flinch}f · Parry ${t.parry}f · Shield release ${t.shieldRelease ?? 8}f / rearm ${t.shieldRearm ?? 15}f · Swipe cooldown ${t.swipeCooldown}f. ` +
    baseMoves
      .map(
        (m) =>
          `${m.name}: ${weaponFields(m)
            .map((f) => f.label + ' ' + t.moves[m.name][f.key])
            .join(', ')}`,
      )
      .join(' · ');
}
$('games').max = MAX_GAMES_PER_PAIR;
$('games-range').textContent = '(1–' + MAX_GAMES_PER_PAIR + ')';
build();
function setRunOptions(raw) {
  $('games').value = gamesPerPair(raw.games ?? runDefaults.games);
  const seed = Number(raw.seed ?? runDefaults.seed);
  $('seed').value = Number.isFinite(seed)
    ? Math.max(0, Math.min(4294967295, Math.trunc(seed)))
    : runDefaults.seed;
}
setRunOptions(saved);
for (const [id, value] of Object.entries(runDefaults)) {
  fields.push(settingField($(id), value, id === 'games' ? 'games per pairing' : 'seed'));
  $(id).onchange = () => {
    setRunOptions({
      games: $('games').value || runDefaults.games,
      seed: $('seed').value || runDefaults.seed,
    });
    refreshFields();
    storeSettings();
  };
}
fill();
storeSettings();
$('settings').onchange = (event) => {
  if (event.target.id !== 'weapon') readForm();
};
$('settings').onsubmit = (event) => event.preventDefault();
$('reset').onclick = () => {
  setRunOptions(runDefaults);
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
  worker = new Worker(new URL('sim-worker.js?v=30', import.meta.url), { type: 'module' });
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
window.addEventListener('message', (event) => {
  const dialog = $('replay-dialog');
  if (
    event.origin !== location.origin ||
    event.source !== dialog.querySelector('iframe').contentWindow ||
    event.data?.type !== 'gym-settings'
  )
    return;
  dialog.close();
  $('settings').scrollIntoView();
  $('tune-difficulty').focus({ preventScroll: true });
});
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
