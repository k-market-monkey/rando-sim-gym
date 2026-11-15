const $ = (id) => document.getElementById(id);
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function health(fighter) {
  return Math.round((fighter.dead ? 0 : fighter.hp) * 10) / 10;
}
const replayDialog = $('replay-dialog');
const replayFrame = $('replay-frame');
$('close-replay').addEventListener('click', () => replayDialog.close());
replayDialog.addEventListener('close', () => {
  replayFrame.src = 'about:blank';
});
replayFrame.addEventListener('load', () => {
  const doc = replayFrame.contentDocument;
  if (!doc) return;
  const style = doc.createElement('style');
  style.textContent = `h1,#overview,#match-title,#verdict,#live-stats,details{display:none}
    .replay-main{padding:4px!important;margin:0 auto!important}
    #gym-canvas{width:min(100%,calc(100vh - 150px));height:auto;margin:0 auto}
    .replay-controls{margin-top:8px}`;
  doc.head.append(style);
});
function render(report, group) {
  const expectedRow = group.id === 'melee-anti';
  $('results').style.setProperty('--row', expectedRow ? '#78f0c5' : '#f574a5');
  $('results').style.setProperty('--column', expectedRow ? '#f574a5' : '#78f0c5');
  for (const button of $('matchups').children)
    button.setAttribute('aria-pressed', String(button.dataset.id === group.id));
  $('heading').textContent = group.label;
  const total = { a: 0, b: 0, draws: 0 };
  for (const pair of group.pairs)
    for (const key of Object.keys(total)) total[key] += pair.wins[key];
  $('summary').textContent =
    `${group.rowLabel}: ${total.a} wins · ${group.columnLabel}: ${total.b} wins · ${total.draws} draws`;
  $('legend').replaceChildren(
    node('span', `${group.rowCode} = ${group.rowLabel}`, 'row-color'),
    node('span', ' · '),
    node('span', `${group.columnCode} = ${group.columnLabel}`, 'column-color'),
    node('span', ' · D = draw · Blue/green = expected winner; magenta = other archetype'),
  );
  const grid = $('grid');
  grid.replaceChildren();
  grid.append(node('caption', '9 combinations · 27 games · Select any game to replay'));
  const head = node('thead'),
    headers = node('tr');
  headers.append(node('th', `${group.rowLabel} ↓ / ${group.columnLabel} →`));
  for (const name of group.columns) {
    const th = node('th', name, 'column-color');
    th.scope = 'col';
    headers.append(th);
  }
  head.append(headers);
  grid.append(head);
  const body = node('tbody');
  group.rows.forEach((name, row) => {
    const tr = node('tr'),
      heading = node('th', name, 'row-color');
    heading.scope = 'row';
    tr.append(heading);
    group.columns.forEach((_, column) => {
      const pair = group.pairs.find((p) => p.row === row && p.column === column),
        cell = node('td');
      cell.append(
        node(
          'div',
          `${pair.wins.a}–${pair.wins.b}${pair.wins.draws ? ` · ${pair.wins.draws} draw${pair.wins.draws === 1 ? '' : 's'}` : ''}`,
          'pair-score',
        ),
      );
      for (const game of pair.games) {
        const result = game.winner === 'a' ? 'row' : game.winner === 'b' ? 'column' : 'draw',
          code = result === 'row' ? group.rowCode : result === 'column' ? group.columnCode : 'D',
          winner = result === 'draw' ? 'Draw' : `${pair.moves[game.winner === 'a' ? 0 : 1]} wins`;
        const link = node('a', undefined, `game ${result}`),
          url = new URL(report.viewerUrl, location.href);
        url.searchParams.set('pair', pair.id);
        url.searchParams.set('game', game.id);
        link.href = url.href;
        link.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          $('replay-title').textContent = `${pair.moves.join(' vs ')} · Game ${game.id}`;
          replayFrame.title = $('replay-title').textContent;
          replayFrame.src = url.href;
          replayDialog.showModal();
        });
        const [a, b] = game.fighters;
        link.setAttribute(
          'aria-label',
          `${pair.moves.join(' versus ')}, game ${game.id}: ${winner}; deaths ${a.deaths} to ${b.deaths}, health ${health(a)} to ${health(b)}. Replay`,
        );
        link.title = winner;
        link.append(
          node('strong', `Game ${game.id} · ${code}`),
          node('span', `${a.deaths}:${b.deaths} deaths · ${health(a)}:${health(b)} HP`),
        );
        cell.append(link);
      }
      tr.append(cell);
    });
    body.append(tr);
  });
  grid.append(body);
  $('results').hidden = false;
  $('status').textContent = '';
  const url = new URL(location.href);
  url.searchParams.set('matchup', group.id);
  history.replaceState(null, '', url);
}
try {
  const response = await fetch('./matchups.json');
  if (!response.ok) throw Error('Could not load gym results');
  const report = await response.json();
  for (const group of report.groups) {
    const button = node('button', group.label);
    button.type = 'button';
    button.dataset.id = group.id;
    button.addEventListener('click', () => render(report, group));
    $('matchups').append(button);
  }
  const requested = new URLSearchParams(location.search).get('matchup');
  render(report, report.groups.find((g) => g.id === requested) || report.groups[0]);
} catch (error) {
  $('status').textContent = error.message;
}
