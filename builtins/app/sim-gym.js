import { createReplayPlayer, replayEnginePath, replayTime } from './replay-player.js';
import { renderArena } from './renderer.js';
const $ = (id) => document.getElementById(id);
const base = new URL('../', import.meta.url);
let report,
  engine,
  pairIndex = 0,
  gameIndex = 0,
  player,
  downloadUrl;
function fighterName(id, pair = report.pairs[pairIndex]) {
  return id === 'a' ? pair.moves[0] : id === 'b' ? pair.moves[1] : 'Draw';
}
function stats(f) {
  return `${f.deaths} deaths · ${f.dead ? 0 : f.hp} HP · ${Math.round(f.shield)} shield`;
}
function draw() {
  if (!player) return;
  renderArena($('gym-canvas'), player.state, { labels: true });
  $('seek').value = String(player.tick);
  $('position').textContent = `${replayTime(player.tick / 30)} / 0:25`;
  $('play').textContent = player.playing
    ? 'Pause'
    : player.tick === player.total
      ? 'Play again'
      : 'Play';
  $('live-stats').textContent = player.state.players
    .map((p) => `${p.name}: ${stats(p)}`)
    .join(' | ');
}
function chooseGame(index) {
  player?.pause();
  gameIndex = index;
  const pair = report.pairs[pairIndex],
    row = pair.games[index];
  $('verification').textContent = 'Verifying replay…';
  player = createReplayPlayer(engine, row.game, {
    onMismatch: ({ tick }) => {
      $('verification').textContent = `Replay verification failed at tick ${tick}.`;
    },
  });
  player.seek(player.total);
  if (player.mismatch) {
    player = null;
    return;
  }
  player.seek(0);
  player.setSpeed(Number($('speed').value));
  $('verification').textContent =
    'Replay verified against every recorded checkpoint and final state.';
  $('match-title').textContent = `${pair.moves.join(' vs ')} · Game ${row.id}`;
  $('verdict').textContent =
    `${row.winner ? fighterName(row.winner) + ' wins' : 'Draw'}. ${pair.moves[0]}: ${stats(row.fighters[0])}; ${pair.moves[1]}: ${stats(row.fighters[1])}. Starting sides: ${pair.moves[0]} ${row.initialSides.a}, ${pair.moves[1]} ${row.initialSides.b}.`;
  if (row.telemetry) {
    const t = row.telemetry,
      shoot = t.shoot || {},
      swipe = t.swipe || {};
    const casts = t.activations + (shoot.activations || 0) + (swipe.activations || 0);
    const damage = t.damage + (shoot.damage || 0) + (swipe.damage || 0);
    const shieldDamage =
      (t.shieldDamage || 0) + (shoot.shieldDamage || 0) + (swipe.shieldDamage || 0);
    $('verdict').textContent +=
      ` Casts: ${casts} (${t.activations} special, ${shoot.activations || 0} Shoot, ${swipe.activations || 0} Swipe); health damage: ${Math.round(damage * 10) / 10}; shield damage: ${Math.round(shieldDamage)}; deflections: ${swipe.deflections || 0}; perfect blocks: ${t.shield?.perfectBlocks || 0}.`;
  }
  for (const tr of $('games').rows)
    tr.setAttribute('aria-current', String(Number(tr.dataset.game) === index));
  $('previous').disabled = index === 0;
  $('next').disabled = index === pair.games.length - 1;
  $('definitions').textContent = JSON.stringify(
    row.game.header.players.map((p) => ({ name: p.name, move: p.loadout[0] })),
    null,
    2,
  );
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(
    new Blob([JSON.stringify(row.game)], { type: 'application/json' }),
  );
  $('download').href = downloadUrl;
  $('download').download = `pair-${pair.id}-game-${row.id}.json`;
  const url = new URL(location.href);
  url.searchParams.set('pair', String(pair.id));
  url.searchParams.set('game', String(row.id));
  history.replaceState(null, '', url);
  draw();
}
function choosePair(index, game = 0) {
  pairIndex = index;
  const pair = report.pairs[index];
  for (const button of $('pairs').children)
    button.setAttribute('aria-pressed', String(Number(button.dataset.pair) === index));
  $('a-heading').textContent = pair.moves[0];
  $('b-heading').textContent = pair.moves[1];
  $('games').replaceChildren();
  pair.games.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.dataset.game = String(i);
    const td = document.createElement('td'),
      button = document.createElement('button');
    button.className = 'button small subtle';
    button.textContent = `Watch ${row.id}`;
    button.addEventListener('click', () => chooseGame(i));
    td.append(button);
    tr.append(td);
    for (const value of [
      fighterName(row.winner),
      stats(row.fighters[0]),
      stats(row.fighters[1]),
      row.seed,
    ]) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      tr.append(cell);
    }
    $('games').append(tr);
  });
  $('viewer').hidden = false;
  chooseGame(game);
}
$('play').addEventListener('click', () => {
  if (!player) return;
  if (player.playing) player.pause();
  else {
    if (player.tick === player.total) player.seek(0);
    player.play();
  }
  draw();
});
$('seek').addEventListener('input', () => {
  player?.seek(Number($('seek').value));
  draw();
});
$('speed').addEventListener('change', () => player?.setSpeed(Number($('speed').value)));
$('previous').addEventListener('click', () => chooseGame(gameIndex - 1));
$('next').addEventListener('click', () => chooseGame(gameIndex + 1));
window.addEventListener('resize', draw);
let previous = performance.now();
function frame(now) {
  player?.advance(now - previous);
  previous = now;
  if (player?.playing || player?.tick === player?.total) draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
try {
  const response = await fetch(new URL('gym-report.json', base));
  if (!response.ok) throw Error('Gym report could not be loaded.');
  report = await response.json();
  const manifestResponse = await fetch(new URL('shared/sim/builds.json', base));
  if (!manifestResponse.ok) throw Error('Engine manifest could not be loaded.');
  const manifest = await manifestResponse.json();
  engine = await import(new URL(replayEnginePath(manifest, report.engineBuild).slice(1), base));
  $('status').textContent =
    `${report.pairs.length} pairs · ${report.gamesPerPair} games each · ${report.engineBuild} · Experiment seed ${report.seed}`;
  if (report.rules.builtins)
    $('rules').textContent =
      '25-second duels · Hard/balanced bots · One special move each · Dash, Shield, Swipe and Shoot enabled. Fewer deaths wins; remaining health breaks ties.';
  report.pairs.forEach((pair, index) => {
    const button = document.createElement('button');
    button.dataset.pair = String(index);
    const title = document.createElement('strong');
    title.textContent = pair.moves.join(' vs ');
    const score = document.createElement('span');
    score.textContent = `${pair.moves[0]} ${pair.wins.a} wins · ${pair.moves[1]} ${pair.wins.b} wins · ${pair.wins.draws} draws`;
    button.append(title, score);
    button.addEventListener('click', () => choosePair(index));
    $('pairs').append(button);
  });
  const params = new URLSearchParams(location.search),
    requestedPair = Number(params.get('pair')) - 1,
    requestedGame = Number(params.get('game')) - 1;
  const pair = requestedPair >= 0 && requestedPair < report.pairs.length ? requestedPair : 0;
  choosePair(
    pair,
    requestedGame >= 0 && requestedGame < report.pairs[pair].games.length ? requestedGame : 0,
  );
} catch (error) {
  $('status').textContent = error.message || 'Gym could not be opened.';
}
