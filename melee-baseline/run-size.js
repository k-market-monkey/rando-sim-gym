export const MAX_GAMES_PER_PAIR = 250;

export function gamesPerPair(value) {
  return Math.max(1, Math.min(MAX_GAMES_PER_PAIR, Math.round(Number(value)) || 24));
}
