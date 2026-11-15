import { createMatch, step, botInput } from '../sim/classic/engine.js';
import { simulationComparison } from '../sim/calibration-rules.js';
import { BASE_MOVES, validateMove } from '../content/classic/moves.js';

/** Real shared-engine bot duels. Numeric tuning never modifies identity or presentation. */
export function evaluateMove(move, { bouts = 24, seed = 1301 } = {}) {
  let wins = 0,
    losses = 0,
    ties = 0,
    kills = 0,
    deaths = 0,
    ticks = 0;
  const results = [];
  for (let i = 0; i < bouts; i++) {
    const base = BASE_MOVES[i % BASE_MOVES.length],
      players = [
        { id: 'candidate', loadout: [move] },
        { id: 'baseline', loadout: [base] },
      ];
    const state = createMatch({
      players,
      stage: 'balance-foundry',
      timeLimit: 25,
      mode: 'simulation',
      seed: seed + i * 7919,
    });
    const side = state.players[0].x < 360 ? 0 : 1;
    while (!state.ended) {
      step(state, Object.fromEntries(state.players.map((p) => [p.id, botInput(state, p.id)])));
      ticks++;
    }
    const a = state.players.find((p) => p.id === 'candidate'),
      b = state.players.find((p) => p.id === 'baseline');
    const difference = simulationComparison(a, b);
    if (difference > 0) wins++;
    else if (difference < 0) losses++;
    else ties++;
    kills += a.kills;
    deaths += a.deaths;
    results.push({
      baseline: base.name,
      stage: state.stage,
      seed: state.seed,
      side,
      kills: a.kills,
      deaths: a.deaths,
      result: Math.sign(difference),
    });
  }
  return {
    bouts,
    wins,
    losses,
    ties,
    winRate: (wins + ties * 0.5) / bouts,
    kills,
    deaths,
    ticks,
    results,
  };
}
const score = (r) => Math.abs(r.winRate - 0.5);
export function calibrateMove(raw, { bouts = 48, holdoutBouts = 48, maxRounds = 8 } = {}) {
  const original = validateMove(raw);
  let candidate = structuredClone(original),
    best = candidate,
    bestReport = null,
    totalTicks = 0;
  const rounds = [];
  for (let round = 0; round < maxRounds; round++) {
    const report = evaluateMove(candidate, { bouts });
    totalTicks += report.ticks;
    rounds.push({
      round,
      damage: candidate.damage,
      cooldown: candidate.cooldown,
      winRate: report.winRate,
      bouts,
    });
    if (!bestReport || score(report) < score(bestReport)) {
      best = structuredClone(candidate);
      bestReport = report;
    }
    if (report.winRate >= 0.35 && report.winRate <= 0.65) break;
    const tooStrong = report.winRate > 0.5;
    candidate.damage = Math.max(
      12,
      Math.min(38, Math.round(candidate.damage * (tooStrong ? 0.84 : 1.18))),
    );
    candidate.cooldown = Math.max(
      24,
      Math.min(180, Math.round(candidate.cooldown * (tooStrong ? 1.16 : 0.84))),
    );
    candidate.knockback = Math.max(0, Math.min(16, candidate.knockback + (tooStrong ? -1 : 1)));
    candidate.radius = Math.max(6, Math.min(70, candidate.radius + (tooStrong ? -2 : 4)));
    if (!tooStrong && ['projectile', 'spread', 'boomerang'].includes(candidate.kind)) {
      candidate.speed = Math.min(18, candidate.speed + 1);
      candidate.duration = Math.min(120, candidate.duration + 6);
    }
    if (!tooStrong && ['trap', 'orbit', 'wall'].includes(candidate.kind))
      candidate.duration = Math.min(120, candidate.duration + 6);
  }
  const holdout = evaluateMove(best, { bouts: holdoutBouts, seed: 28031 });
  totalTicks += holdout.ticks;
  return {
    move: validateMove(best),
    report: {
      method: 'standard-simulation-duels-v2',
      target: [0.35, 0.65],
      acceptance: [0.25, 0.75],
      training: bestReport,
      holdout,
      rounds,
      totalTicks,
      accepted: holdout.winRate >= 0.25 && holdout.winRate <= 0.75,
      notes:
        'Scripted bot balance is a guardrail, not a guarantee of human competitive fairness. Behavior and assets are immutable; only bounded numbers are tuned.',
    },
  };
}
