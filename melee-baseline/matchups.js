// Indices in moves.json: Lunge, Spin, Spear. Simulation seats may alternate.
export const MATCHUPS = [
  [0, 1],
  [2, 0],
  [1, 2],
];
export function orderedPair(pair) {
  if (pair.moves[0] !== 'lunge slash' || pair.moves[1] !== 'spear thrust') return pair;
  return {
    ...pair,
    moves: [pair.moves[1], pair.moves[0]],
    mean: -pair.mean,
    wins: pair.losses,
    losses: pair.wins,
    games: pair.games.map((g) => ({
      ...g,
      score: -g.score,
      winner: g.winner === 'a' ? 'b' : g.winner === 'b' ? 'a' : g.winner,
    })),
  };
}
