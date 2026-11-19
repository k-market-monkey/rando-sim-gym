import { matchupStats } from './stats-view.js?v=26';
import { distribution } from './duel-stats.js?v=26';
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const short = (name) =>
  ({ 'lunge slash': 'Lunge', 'spinning sweep': 'Spin', 'spear thrust': 'Spear' })[name] || name;
export function renderScores(container, report, onReplay, onPlay) {
  container.replaceChildren();
  for (const [index, pair] of report.pairs.entries()) {
    const [a, b] = pair.moves,
      n = pair.games.length,
      mean = pair.mean ?? pair.games.reduce((v, g) => v + g.score, 0) / n;
    const card = el('section', 'score-card'),
      heading = el('div', 'match-heading');
    heading.append(el('h2', 'side-a', a), el('span', 'versus', 'vs'), el('h2', 'side-b', b));
    card.append(heading);
    const favored = mean > 0 ? a : mean < 0 ? b : null;
    card.append(
      el(
        'div',
        'advantage ' + (mean > 0 ? 'side-a' : mean < 0 ? 'side-b' : ''),
        favored ? `${short(favored)} leads by ${Math.abs(mean).toFixed(1)}` : 'Even matchup',
      ),
    );
    const spread = distribution(pair.games.map((g) => g.score));
    const wins = pair.wins ?? pair.games.filter((g) => g.winner === 'a').length;
    const losses = pair.losses ?? pair.games.filter((g) => g.winner === 'b').length;
    const headline = el('dl', 'score-headlines');
    for (const [label, value] of [
      ['Average score', mean],
      ['Median score', spread.five[2]],
    ]) {
      const row = el('div');
      const name = value > 0 ? short(a) : value < 0 ? short(b) : 'Even';
      row.append(
        el('dt', '', label),
        el(
          'dd',
          value > 0 ? 'side-a' : value < 0 ? 'side-b' : '',
          (value > 0 ? '+' : '') + value.toFixed(1) + ' · ' + name,
        ),
      );
      headline.append(row);
    }
    const rates = el('div'),
      rateValues = el('dd', 'rate-values');
    rateValues.append(
      el('span', 'side-a', short(a) + ' ' + ((100 * wins) / n).toFixed(1) + '%'),
      el('span', 'side-b', short(b) + ' ' + ((100 * losses) / n).toFixed(1) + '%'),
    );
    rates.append(el('dt', '', 'Win rate'), rateValues);
    rates.title = 'Wins divided by all games, including ties';
    headline.append(rates);
    card.append(headline);
    const labels = el('div', 'scale-labels');
    labels.append(
      el('span', 'side-a', `+ favors ${short(a)}`),
      el('span', 'side-b', `− favors ${short(b)}`),
    );
    card.append(labels);
    const track = el('div', 'advantage-track'),
      zero = el('span', 'zero'),
      bar = el('span', 'advantage-fill');
    bar.style.width = `${Math.abs(mean) / 2}%`;
    bar.style.left = `${mean > 0 ? 50 - Math.abs(mean) / 2 : 50}%`;
    bar.style.background = mean >= 0 ? 'var(--a)' : 'var(--b)';
    track.append(bar, zero);
    track.setAttribute('role', 'img');
    track.setAttribute(
      'aria-label',
      `Average ${mean.toFixed(1)}, ${favored ? 'favors ' + favored : 'even'}`,
    );
    card.append(track);
    card.append(
      el(
        'p',
        'wins',
        `${short(a)} ${wins} wins · ${pair.draws ?? pair.games.filter((g) => g.winner === 'draw').length} ties · ${short(b)} ${losses} wins`,
      ),
    );
    if (onPlay) {
      const links = el('div', 'play-links');
      for (const [side, name] of [
        ['a', a],
        ['b', b],
      ]) {
        const link = el('a', side === 'a' ? 'side-a' : 'side-b', 'Play as ' + short(name));
        link.href = onPlay(index + 1, side);
        links.append(link);
      }
      card.append(links);
    }
    card.append(matchupStats(pair, spread));
    const grid = el('div', 'game-grid');
    for (const game of pair.games) {
      const favored = game.score > 0 ? a : game.score < 0 ? b : null;
      const button = el(
        'button',
        'game ' + (game.score > 0 ? 'a-win' : game.score < 0 ? 'b-win' : 'tie'),
      );
      button.type = 'button';
      button.title = `Game ${game.id}: ${favored ? 'score favors ' + favored : 'zero score'}; ${(game.ticks / 30).toFixed(1)} simulation seconds`;
      button.append(
        el('span', 'game-number', String(game.id)),
        el('strong', 'game-score', `${game.score > 0 ? '+' : ''}${game.score.toFixed(1)}`),
        el('span', 'game-favored', favored ? short(favored) : 'Even'),
      );
      button.onclick = () => onReplay(game, `${a} vs ${b} · Game ${game.id}`, pair.moves);
      grid.append(button);
    }
    card.append(grid);
    container.append(card);
  }
}
export function openReplay(dialog, game, title, tuning, moves) {
  const frame = dialog.querySelector('iframe');
  dialog.querySelector('.replay-title').textContent = title;
  frame.onload = () =>
    frame.contentWindow.postMessage(
      { type: 'gym-replay', game, title, tuning, moves },
      location.origin,
    );
  frame.src = new URL('replay17.html?v=29', import.meta.url);
  dialog.showModal();
}
