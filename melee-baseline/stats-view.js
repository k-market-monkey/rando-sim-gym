import { distribution } from './duel-stats.js';
const node = (tag, text) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
};
const fmt = (x) => Number(x.toFixed(2)).toLocaleString();
export function combatTable(games, moves, average) {
  const table = node('table');
  table.className = 'combat-table';
  const caption = node('caption', average ? 'Per-game averages' : 'Game totals');
  table.append(caption);
  const heading = table.createTHead().insertRow();
  for (const title of ['Metric', ...moves]) heading.append(node('th', title));
  const body = table.createTBody();
  const sides = moves.map((move) =>
    games.map((g) => {
      const seat = g.game.header.players.find((p) => p.loadout[0].name === move);
      return g.stats[seat.id];
    }),
  );
  function row(label, measure) {
    const tr = body.insertRow();
    tr.append(node('th', label));
    for (const group of sides)
      tr.append(node('td', fmt(group.reduce((sum, s) => sum + measure(s), 0) / group.length)));
  }
  row('HP damage dealt', (s) => Object.values(s.damage).reduce((a, b) => a + b, 0));
  const weapons = new Set([
    'Built-in gun',
    'Built-in swipe',
    ...moves,
    ...sides.flat().flatMap((s) => Object.keys(s.damage)),
  ]);
  for (const weapon of weapons) row('↳ ' + weapon, (s) => s.damage[weapon] || 0);
  row('Steps moved (ticks)', (s) => s.movingTicks);
  row('Distance (tiles)', (s) => s.distance / 40);
  row('Shield raised (s)', (s) => s.shieldingTicks / 30);
  row('Perfect blocks', (s) => s.parries);
  row('Projectile deflections', (s) => s.deflections);
  const wrap = node('div');
  wrap.append(
    table,
    node(
      'small',
      'A step is one tick with displacement, including dashes and knockback. Damage counts opponent HP removed.',
    ),
  );
  return wrap;
}
export function matchupStats(pair) {
  const panel = node('section');
  panel.className = 'match-stats';
  const { five, bins, variance } = distribution(pair.games.map((g) => g.score));
  panel.append(
    node('h3', 'Score distribution'),
    node('p', 'Median ' + fmt(five[2]) + ' · Variance ' + fmt(variance) + ' points²'),
  );
  const box = node('div');
  box.className = 'quartiles';
  const percent = (x) => (x + 100) / 2;
  for (const [className, start, end] of [
    ['whisker', five[0], five[4]],
    ['quartile-box', five[1], five[3]],
    ['median', five[2], five[2]],
  ]) {
    const mark = node('i');
    mark.className = className;
    mark.style.left = percent(start) + '%';
    mark.style.width = percent(end) - percent(start) + '%';
    box.append(mark);
  }
  const summary = five
    .map((v, i) => ['Min', 'Q1', 'Median', 'Q3', 'Max'][i] + ' ' + fmt(v))
    .join(' · ');
  box.setAttribute('aria-label', summary);
  box.setAttribute('role', 'img');
  panel.append(box, node('small', summary));
  const histogram = node('div');
  histogram.className = 'histogram';
  const peak = Math.max(...bins);
  const counts = node('details');
  counts.append(node('summary', 'Histogram counts'));
  const list = node('ul');
  counts.append(list);
  bins.forEach((count, i) => {
    const start = -100 + i * 20,
      end = start + 20;
    const label = start + ' to ' + (i === 9 ? '' : '< ') + end + ': ' + count + ' games';
    const bar = node('i');
    bar.style.height = (100 * count) / peak + '%';
    bar.title = label;
    bar.style.background = i < 5 ? 'var(--b)' : 'var(--a)';
    histogram.append(bar);
    list.append(node('li', label));
  });
  const axis = node('div');
  axis.className = 'hist-axis';
  for (const label of ['−100', '0', '+100']) axis.append(node('span', label));
  panel.append(histogram, axis, counts);
  const combat = node('div');
  panel.append(combat);
  if (pair.games.every((g) => g.stats)) combat.append(combatTable(pair.games, pair.moves, true));
  else {
    const button = node('button', 'Calculate combat stats from replays');
    button.onclick = () => {
      button.disabled = true;
      button.textContent = 'Reading recorded games…';
      const worker = new Worker(new URL('./recorded-stats-worker.js', import.meta.url), {
        type: 'module',
      });
      const fail = () => {
        worker.terminate();
        button.disabled = false;
        button.textContent = 'Retry combat stats';
      };
      worker.onerror = fail;
      worker.onmessage = ({ data }) => {
        if (data.error) {
          fail();
          return;
        }
        worker.terminate();
        pair.games.forEach((g, i) => (g.stats = data.stats[i]));
        combat.replaceChildren(combatTable(pair.games, pair.moves, true));
      };
      worker.postMessage(pair.games.map((g) => g.game));
    };
    combat.append(button);
  }
  return panel;
}
