import { SIMULATION_MAP, SIMULATION_MAP_V1 } from '../content/maps/simulation-map.js';

export const SIMULATION_SECONDS = 25;
export const SIMULATION_TICKS = 750;
/** Internal duel rules override caller settings, including per-player handicaps. */
export function simulationOptions(options) {
  if (options.players?.length !== 2) throw Error('Simulation requires exactly two players');
  const map =
    options.stage === SIMULATION_MAP.id && options.mapRevision === 1
      ? SIMULATION_MAP_V1
      : SIMULATION_MAP;
  return {
    ...options,
    players: options.players.map((p) => ({ ...p, handicapPercent: 100 })),
    mode: 'simulation',
    stage: map.id,
    mapRevision: map.revision,
    timeLimit: SIMULATION_SECONDS,
    shrinkAfter: 0,
    healthPercent: 100,
    speedPercent: 100,
    teamBattle: false,
    itemDrops: 'off',
    dashEnabled: true,
    shieldEnabled: true,
    swipeEnabled: true,
    shootEnabled: true,
    botDifficulty: 'hard',
  };
}
// Independent deterministic draws: side assignment, then each player's x/y.
function roll(seed, salt) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
export function simulationSpawn(state, index, deaths = 0) {
  const map = state.arenaWidth === SIMULATION_MAP_V1.width ? SIMULATION_MAP_V1 : SIMULATION_MAP,
    right = (index + (roll(state.seed, 0) % 2)) % 2,
    salt = 1 + index * 2 + deaths * 4,
    margin = map.revision === 1 ? 80 : 60,
    band = map.revision === 1 ? 101 : 41,
    x = margin + (roll(state.seed, salt) % band),
    y = margin + (roll(state.seed, salt + 1) % (map.height - margin * 2 + 1));
  return [right ? map.width - x : x, y];
}
/** Deaths are primary. Dead fighters have no health until they respawn. */
export const simulationHealth = (player) => (player.dead ? 0 : player.hp);
/** Positive means a wins; health can never outweigh even one death. */
export const simulationComparison = (a, b) =>
  b.deaths - a.deaths || simulationHealth(a) - simulationHealth(b);
