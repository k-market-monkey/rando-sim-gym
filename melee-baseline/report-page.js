import { renderScores, openReplay } from './score-view.js';
import { defaults } from './tuning.js';
const $ = (id) => document.getElementById(id);
try {
  const [report, moves] = await Promise.all([
    fetch('report.json').then((r) => r.json()),
    fetch('../melee-baseline/moves.json').then((r) => r.json()),
  ]);
  $('report-title').textContent =
    report.engineBuild === 'composed-b9004'
      ? 'Melee · earlier Moderate bot'
      : 'Melee · defense-tuned Moderate bot';
  $('report-status').textContent =
    `${report.pairs.reduce((n, p) => n + p.games.length, 0)} games · Recorded run · Positive favors the teal move; negative favors the pink move. Click a game to replay here.`;
  renderScores($('scores'), report, (game, title) =>
    openReplay($('dialog'), game.game, title, report.tuning || defaults(moves)),
  );
} catch (e) {
  $('report-status').textContent = e.message;
}
$('close').onclick = () => $('dialog').close();
$('dialog').onclose = () => {
  $('dialog').querySelector('iframe').src = 'about:blank';
};
