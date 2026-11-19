import {
  createReplayPlayer,
  replayEnginePath,
  replayTime,
  REPLAY_TICK_RATE,
} from './replay-player.js';
import { renderArena, receiveEffects } from './renderer.js';
import { createAudio } from './audio.js';
import { loadPreferences, savePreferences } from './preferences.js';
import { MAP_CATALOG } from '../shared/content/maps/catalog.js';

const $ = (id) => document.getElementById(id);
const modes = {
  simulation: 'Simulation',
  timed: 'Timed',
  lives: 'Lives',
  hill: 'Hill',
  ctf: 'Capture the flag',
};
const phases = {
  training: 'Training',
  holdout: 'Holdout',
  companion: 'With a companion',
  ffa: 'Free-for-all',
};
const percent = (value) => (Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—');
const number = (value) => (Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '—');
const phaseKey = (row) => `${row.phase}:${row.round ?? ''}`;
const phaseLabel = (row) =>
  `${phases[row.phase] || row.phase}${row.round == null ? '' : ` · round ${row.round + 1}`}`;
const mapName = (id) => MAP_CATALOG.find((map) => map.id === id)?.name || id || 'Arena';
const audio = createAudio({
  enabled: loadPreferences().sound,
  persist: (enabled) => savePreferences({ ...loadPreferences(), sound: enabled }),
});
audio.mountToggle($('audio-toggle'));
let report,
  selectedCase,
  player,
  reportFlight,
  caseFlight,
  lastFrame,
  playbackFailed = false;

function option(select, value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  select.append(element);
}
function tableRow(body, values, mode = false) {
  const row = document.createElement('tr');
  if (mode) row.dataset.mode = 'true';
  values.forEach((value, index) => {
    const cell = document.createElement(index ? 'td' : 'th');
    cell.textContent = value;
    if (!index) cell.scope = 'row';
    row.append(cell);
  });
  body.append(row);
}
async function request(path, signal, method = 'GET') {
  const response = await fetch(path, {
    method,
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok && !['unavailable', 'mismatch'].includes(data.status))
    throw Error(data.message || data.error || 'Could not load this test. Try again.');
  return data;
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
function retry(message, action) {
  $('balance-status').textContent = message;
  $('balance-retry').hidden = false;
  $('balance-retry').onclick = action;
}
function updateLink() {
  if (!report?.evidenceId) return;
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('evidence', report.evidenceId);
  if (selectedCase) url.searchParams.set('case', selectedCase.id);
  history.replaceState(null, '', url);
}
function renderSummary() {
  const summary = report.summary || {};
  document.title = `${report.move.name} balance — RANDO`;
  $('balance-title').textContent = report.move.name;
  $('balance-provenance').textContent =
    `${report.provenance?.label || 'Saved balance results'}${report.provenance?.engineBuild ? ` · ${report.provenance.engineBuild}` : ''}`;
  $('balance-verdict').textContent =
    `${summary.accepted === true ? 'Passed' : summary.accepted === false ? 'Did not pass' : 'No saved verdict'}${summary.acceptance ? ` · Holdout acceptance: ${percent(summary.acceptance[0])}–${percent(summary.acceptance[1])}` : ''}${summary.target ? ` · Training target: ${percent(summary.target[0])}–${percent(summary.target[1])}` : ''}`;
  const version = $('balance-version');
  version.replaceChildren();
  for (const entry of report.versions || [{ revision: report.move.revision }])
    option(version, entry.revision, `Version ${entry.revision}`);
  version.value = String(report.move.revision);
  const body = $('balance-summary').tBodies[0];
  body.replaceChildren();
  const add = (label, result, mode = false) =>
    tableRow(
      body,
      [
        label,
        number(result.wins),
        number(result.losses),
        number(result.ties),
        percent(result.winRate),
      ],
      mode,
    );
  for (const phase of ['training', 'holdout', 'companion']) {
    const result = summary[phase];
    if (!result) continue;
    add(phases[phase], result);
    for (const [mode, data] of Object.entries(result.modes || {}))
      add(modes[mode] || mode, data, true);
  }
  const modeRates = Object.values(summary.holdout?.modes || {})
    .map((row) => row.winRate)
    .filter(Number.isFinite);
  const notes = [
    summary.holdout?.modes?.simulation
      ? '25-second duels. Fewer deaths wins; remaining health breaks ties. The companion test is reported separately.'
      : 'The total averages different modes. The companion test is reported separately.',
  ];
  if (modeRates.length && Math.max(...modeRates) - Math.min(...modeRates) > 0.4)
    notes.push('This move has substantially different results between modes.');
  if (Number.isFinite(summary.ffa?.meanRankDelta))
    notes.push(
      `Free-for-all rank difference: ${number(summary.ffa.meanRankDelta)} (positive favors this move).`,
    );
  $('balance-limits').textContent = notes.join(' ');
  renderDefenseEvidence(summary);
  const stage = $('balance-phase');
  stage.replaceChildren();
  const groups = new Map((report.cases || []).map((row) => [phaseKey(row), phaseLabel(row)]));
  for (const [key, label] of groups) option(stage, key, label);
  stage.disabled = !groups.size;
  const desired = new URLSearchParams(location.search).get('case');
  const first =
    report.cases?.find((row) => row.id === desired) ||
    report.cases?.find((row) => row.phase === 'holdout') ||
    report.cases?.[0];
  if (first) stage.value = phaseKey(first);
  renderCases(first?.id);
}
function renderDefenseEvidence(summary) {
  const defense = $('balance-defense-table').tBodies[0];
  defense.replaceChildren();
  for (const row of summary.defenseChecks || [])
    tableRow(defense, [
      `${row.name === 'placed-cover-prevents-damage' ? 'Placed cover' : 'Beam reflection'} · ${row.attackKind || row.attack}`,
      number(row.protectedDamage),
      number(row.controlDamage),
      number(row.preventedDamage),
      number(row.expiredDamage),
      row.passed ? 'Pass' : 'Fail',
    ]);
  $('balance-defense').hidden = !defense.rows.length;
  const companion = $('balance-companion-table').tBodies[0];
  companion.replaceChildren();
  for (const phase of ['training', 'holdout', 'companion']) {
    const evidence = summary[phase]?.companionEvidence;
    if (!evidence) continue;
    tableRow(companion, [
      phases[phase],
      number(evidence.bouts),
      `${number(evidence.candidate.activations)} / ${number(evidence.candidate.damage)}`,
      `${number(evidence.baseline.activations)} / ${number(evidence.baseline.damage)}`,
    ]);
  }
  $('balance-companion-use').hidden = !companion.rows.length;
}
function renderCases(preferred) {
  const select = $('balance-case');
  select.replaceChildren();
  const rows = (report.cases || []).filter((row) => phaseKey(row) === $('balance-phase').value);
  for (const [index, row] of rows.entries()) {
    const measured = row.measuredResult;
    const verdict =
      measured?.result === 1
        ? 'win'
        : measured?.result === 0
          ? 'loss'
          : measured?.result === 0.5
            ? 'draw'
            : row.variant || '';
    option(
      select,
      row.id,
      `${index + 1}. ${mapName(row.header?.stage)} · ${modes[row.header?.mode] || row.header?.mode || ''}${row.opponent ? ` · vs ${row.opponent}` : ''}${verdict ? ` · ${verdict}` : ''}`,
    );
  }
  select.disabled = !rows.length;
  if (rows.some((row) => row.id === preferred)) select.value = preferred;
  loadCase(select.value);
}
function showMeasurement(row, reconstructed = false) {
  const measured = row.measuredResult;
  $('balance-measurement').textContent = !measured
    ? 'Detailed final statistics were not saved for this test.'
    : measured.kind === 'ffa'
      ? `Candidate rank score: ${percent(measured.rankScore)}. Compare with the paired reference test.`
      : `${measured.result === 1 ? 'Candidate win' : measured.result === 0 ? 'Candidate loss' : 'Draw'} · ${String(measured.reason || 'saved balance comparison').replaceAll('-', ' ')}. ${row.header?.mode === 'simulation' ? 'Fewer deaths wins; remaining health breaks ties.' : 'Balance scoring uses the objective, kills and remaining health.'}`;
  const table = $('balance-fighters');
  table.caption.textContent = reconstructed
    ? 'Final statistics from reconstruction'
    : 'Final test statistics';
  const body = table.tBodies[0];
  body.replaceChildren();
  for (const fighter of measured?.players || [])
    tableRow(body, [
      fighter.id === measured.ownerId ? report.move.name : fighter.id,
      `${number(fighter.hp)} / ${number(fighter.maxHp)}`,
      number(fighter.kills),
      number(fighter.deaths),
      row.header?.mode === 'simulation' ? '—' : number(fighter.lives),
      row.header?.mode === 'simulation' ? '—' : number(fighter.score),
    ]);
  table.hidden = !body.rows.length;
}
async function loadCase(id) {
  caseFlight?.abort();
  caseFlight = new AbortController();
  const { signal } = caseFlight;
  player?.pause();
  player = null;
  lastFrame = undefined;
  playbackFailed = false;
  $('balance-player').hidden = true;
  $('balance-definitions').hidden = true;
  $('balance-status').textContent = '';
  $('balance-retry').hidden = true;
  selectedCase = report?.cases?.find((row) => row.id === id);
  updateLink();
  if (!selectedCase) {
    $('balance-case-status').textContent = 'Individual test evidence was not saved for this move.';
    $('balance-case-meta').textContent = '';
    $('balance-measurement').textContent = '';
    $('balance-fighters').hidden = true;
    return;
  }
  const row = selectedCase;
  showMeasurement(row);
  $('balance-case-meta').textContent =
    `${phaseLabel(row)} · ${mapName(row.header?.stage)} · ${modes[row.header?.mode] || row.header?.mode || ''}${row.header?.botDifficulty ? ` · ${row.header.botDifficulty} bots` : ''}${row.inputPolicy?.style ? ` · ${row.inputPolicy.style}` : ''}${row.companion ? ` · companion: ${row.companion}` : ''}`;
  if (row.playback === 'unavailable') {
    $('balance-case-status').textContent =
      row.unavailableReason || 'The information needed to replay this test was not saved.';
    return;
  }
  $('balance-case-status').textContent = 'Preparing this test replay…';
  const path = `/api/balance/${encodeURIComponent(report.evidenceId)}/cases/${encodeURIComponent(id)}/replay`;
  try {
    let response = await request(path, signal, 'POST');
    for (let attempt = 0; response.status === 'pending' && attempt < 45; attempt++) {
      await delay(Math.max(250, Math.min(5000, (response.retryAfter || 1) * 1000)), signal);
      response = await request(path, signal);
    }
    if (signal.aborted) return;
    if (response.status !== 'ready') {
      $('balance-case-status').textContent =
        response.message ||
        (response.status === 'pending'
          ? 'This test is still preparing. Try again shortly.'
          : 'This test cannot be reproduced from the saved evidence.');
      if (['pending', 'unavailable'].includes(response.status))
        retry(response.message || 'Test replay is still preparing.', () => loadCase(id));
      return;
    }
    const manifest = await request(
      '/rando-sim-gym/melee-baseline/human17/shared/sim/builds.json',
      signal,
    );
    const engine = await import(replayEnginePath(manifest, response.game.engineBuild));
    if (signal.aborted) return;
    player = createReplayPlayer(engine, response.game, {
      onMismatch({ tick }) {
        playbackFailed = true;
        player?.pause();
        $('balance-case-status').textContent =
          `Verification failed at tick ${tick}. Playback stopped.`;
      },
      onStep(state, previous) {
        audio.playState(state, previous, $('balance-follow').value || null);
        receiveEffects(state.events);
      },
    });
    $('balance-case-status').textContent =
      (response.provenance?.kind || row.playback || report.provenance?.kind) === 'reconstruction'
        ? 'Reconstructed with preserved rules; saved results match. The original engine build was not recorded.'
        : 'Verified reproduction of the saved test inputs and final state.';
    if (response.reconstructedMeasurement)
      showMeasurement({ ...row, measuredResult: response.reconstructedMeasurement }, true);
    $('balance-definitions').hidden = false;
    $('balance-definitions').querySelector('pre').textContent = JSON.stringify(
      response.game.header.players.map(({ id, loadout }) => ({ fighter: id, moves: loadout })),
      null,
      2,
    );
    $('balance-seek').max = player.total;
    $('balance-follow').replaceChildren();
    option($('balance-follow'), '', 'All fighters');
    for (const fighter of player.state.players)
      option(
        $('balance-follow'),
        fighter.id,
        fighter.id === row.measuredResult?.ownerId ? report.move.name : fighter.name || fighter.id,
      );
    player.setSpeed(Number($('balance-speed').value));
    $('balance-player').hidden = false;
    draw();
  } catch (error) {
    if (!signal.aborted) retry(error.message || 'Could not load this test.', () => loadCase(id));
  }
}
async function loadReport(query) {
  reportFlight?.abort();
  caseFlight?.abort();
  player?.pause();
  player = null;
  reportFlight = new AbortController();
  const { signal } = reportFlight;
  $('balance-report').hidden = true;
  $('balance-retry').hidden = true;
  $('balance-status').textContent = 'Loading balance results…';
  const params = query || new URLSearchParams(location.search);
  const evidence = params.get('evidence');
  const name = params.get('name');
  try {
    if (!evidence && !name) throw Error('Choose Balance beside a move in your loadout.');
    const path = evidence
      ? `/api/balance/${encodeURIComponent(evidence)}`
      : `/api/balance?${new URLSearchParams({ mechanicsVersion: 'composed', name, ...(params.get('revision') ? { revision: params.get('revision') } : {}) })}`;
    const result = await request(path, signal);
    if (signal.aborted) return;
    if (!result.move || !Array.isArray(result.cases))
      throw Error('Balance evidence is unavailable for this move.');
    report = result;
    $('balance-status').textContent = '';
    $('balance-report').hidden = false;
    renderSummary();
  } catch (error) {
    if (!signal.aborted) retry(error.message, () => loadReport(params));
  }
}
function draw() {
  if (!player) return;
  renderArena($('balance-canvas'), player.state, {
    localId: $('balance-follow').value || null,
    labels: true,
  });
  $('balance-seek').value = player.tick;
  $('balance-position').textContent =
    `${replayTime(player.tick / REPLAY_TICK_RATE)} / ${replayTime(player.total / REPLAY_TICK_RATE)}`;
  $('balance-toggle').textContent = player.playing
    ? 'Pause'
    : player.tick === player.total
      ? 'Play again'
      : 'Play';
  $('balance-live-stats').textContent = player.state.players
    .map((fighter) => `${fighter.id}: ${number(fighter.hp)} HP · ${fighter.kills} kills`)
    .join('  |  ');
}
function action(run) {
  if (player && !playbackFailed) {
    try {
      run();
      draw();
    } catch (error) {
      playbackFailed = true;
      player.pause();
      $('balance-case-status').textContent = error.message;
    }
  }
}
function toggle() {
  action(() => {
    if (player.playing) player.pause();
    else {
      if (player.tick === player.total) player.seek(0);
      player.play();
    }
  });
}
$('balance-toggle').onclick = toggle;
$('balance-seek').oninput = () => action(() => player.seek(Number($('balance-seek').value)));
$('balance-speed').onchange = () => action(() => player.setSpeed(Number($('balance-speed').value)));
$('balance-follow').onchange = () => action(() => {});
$('balance-phase').onchange = () => renderCases();
$('balance-case').onchange = () => loadCase($('balance-case').value);
$('balance-version').onchange = () =>
  loadReport(new URLSearchParams({ name: report.move.name, revision: $('balance-version').value }));
$('balance-share').onclick = async () => {
  updateLink();
  try {
    await navigator.clipboard.writeText(location.href);
    $('balance-status').textContent = 'Test link copied.';
  } catch {
    $('balance-status').textContent = `Test link: ${location.href}`;
  }
};
document.addEventListener('keydown', (event) => {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target.closest('input, select, textarea, button, a, [contenteditable="true"]')
  )
    return;
  if (!['Space', 'ArrowLeft', 'ArrowRight'].includes(event.code) || !player) return;
  event.preventDefault();
  if (event.code === 'Space') {
    if (!event.repeat) toggle();
  } else
    action(() =>
      player.seek(player.tick + (event.code === 'ArrowLeft' ? -5 : 5) * REPLAY_TICK_RATE),
    );
});
document.addEventListener('visibilitychange', () => {
  lastFrame = undefined;
});
function frame(now) {
  if (player && !playbackFailed)
    action(() => {
      if (lastFrame !== undefined && !document.hidden) player.advance(now - lastFrame);
      lastFrame = now;
    });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
loadReport();
