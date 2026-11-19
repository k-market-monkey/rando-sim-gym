// Two-sided 95% Student-t critical values, rounded up. Use the next lower
// tabulated degrees of freedom for a conservative approximation.
const critical = [
  [1, 12.707],
  [2, 4.303],
  [3, 3.183],
  [4, 2.777],
  [5, 2.571],
  [6, 2.447],
  [7, 2.365],
  [8, 2.307],
  [9, 2.263],
  [10, 2.229],
  [12, 2.179],
  [15, 2.132],
  [20, 2.086],
  [25, 2.06],
  [30, 2.043],
  [40, 2.022],
  [60, 2.001],
  [120, 1.98],
];
export function scoreInterval(pair) {
  const groups = [[], []];
  for (const game of pair.games) {
    const seat = game.game.header.players.findIndex((p) => p.loadout[0].name === pair.moves[0]);
    groups[seat].push(game.score);
  }
  if (groups.some((g) => g.length < 2)) return { message: 'Needs 2 games per seat' };
  const n = pair.games.length;
  let mean = 0,
    variance = 0,
    denominator = 0;
  for (const group of groups) {
    const k = group.length,
      weight = k / n;
    const average = group.reduce((a, b) => a + b, 0) / k;
    const sampleVariance = group.reduce((sum, x) => sum + (x - average) ** 2, 0) / (k - 1);
    const term = (weight * weight * sampleVariance) / k;
    mean += weight * average;
    variance += term;
    denominator += (term * term) / (k - 1);
  }
  if (variance === 0) return { message: 'No observed within-seat variation' };
  const df = Math.max(1, (variance * variance) / denominator);
  const t = critical.findLast(([d]) => d <= df)[1];
  const margin = t * Math.sqrt(variance);
  return { lower: Math.max(-100, mean - margin), upper: Math.min(100, mean + margin) };
}
