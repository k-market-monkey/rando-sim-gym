import { square } from '../sim/exact-math.js';
import { checkDeadline } from './deadline.js';

export const ADAPTIVE_TRAINING_REVISION = 'composed-adaptive-training-standard-duels-v5-builtins';
export const ADAPTIVE_MANIFEST_REVISION = 'composed-training-48-independent-duels-v5-builtins';
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
// Nested independent-game batches preserve 12/24/48 exploratory budgets.
export const ADAPTIVE_BATCHES = freeze(
  [12, 24, 48].map((count) => Array.from({ length: count }, (_, i) => i)),
);
export const ADAPTIVE_THRESHOLDS = freeze({
  12: { weak: 0.15, strong: 0.85 },
  24: { weak: 0.25, strong: 0.75 },
  target: [0.4, 0.6],
  maxCandidates: 6,
});

/** Snapshot supplied by the owning evaluator, including actual reference and
 * companion definitions. It is provenance for one run, never a mutable policy. */
export function adaptiveManifest(cases) {
  if (cases.length !== 48) throw Error('Adaptive training requires 48 independent cases');
  return freeze({
    revision: ADAPTIVE_MANIFEST_REVISION,
    botDifficulty: 'hard',
    swipeEnabled: true,
    shootEnabled: true,
    cases: structuredClone(cases),
  });
}
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
function combine(samples) {
  const results = [],
    telemetry = {},
    modes = {},
    groups = [];
  let wins = 0,
    losses = 0,
    ties = 0,
    ticks = 0;
  for (const sample of samples) {
    wins += sample.wins;
    losses += sample.losses;
    ties += sample.ties;
    ticks += sample.ticks;
    groups.push(sample.winRate);
    for (const [key, value] of Object.entries(sample.telemetry))
      if (Number.isFinite(value)) telemetry[key] = (telemetry[key] || 0) + value;
    for (const result of sample.results) {
      results.push(result);
      (modes[result.mode] ||= []).push(result.result);
    }
  }
  const winRate = (wins + ties * 0.5) / Math.max(1, results.length),
    variance =
      groups.length > 1
        ? groups.reduce((sum, value) => sum + square(value - mean(groups)), 0) / (groups.length - 1)
        : 0,
    margin = 1.96 * Math.sqrt(variance / Math.max(1, groups.length));
  return {
    bouts: results.length,
    wins,
    losses,
    ties,
    winRate,
    ticks,
    telemetry,
    sampleCount: groups.length,
    winRateInterval95: [Math.max(0, winRate - margin), Math.min(1, winRate + margin)],
    modes: Object.fromEntries(
      Object.entries(modes).map(([mode, values]) => [
        mode,
        {
          bouts: values.length,
          winRate: mean(values),
          wins: values.filter((v) => v === 1).length,
          losses: values.filter((v) => v === 0).length,
          ties: values.filter((v) => v === 0.5).length,
        },
      ]),
    ),
    results,
  };
}
/** Exploratory direction rules, not confidence guarantees or admission gates.
 * Ambiguous samples expand; no partial batch can become final training evidence. */
export function adaptiveDirection(report) {
  const threshold = ADAPTIVE_THRESHOLDS[report.bouts];
  if (!threshold) return null;
  if (report.winRate <= threshold.weak && report.winRateInterval95[1] < 0.4) return false;
  if (report.winRate >= threshold.strong && report.winRateInterval95[0] > 0.6) return true;
  return null;
}

export function runAdaptiveTraining(
  original,
  { maxRounds = 6, deadline = Infinity, evaluateCase, tune, manifest },
) {
  if (
    !Number.isInteger(maxRounds) ||
    maxRounds < 1 ||
    maxRounds > ADAPTIVE_THRESHOLDS.maxCandidates
  )
    throw Error('Adaptive training requires one to six tuning rounds');
  if (manifest?.cases?.length !== 48)
    throw Error('Adaptive training requires 48 independent cases');
  const cache = new Map(),
    rounds = [],
    confirmations = [],
    exploration = [];
  let totalTicks = 0,
    executedBouts = 0,
    reusedBouts = 0,
    best = null,
    training = null,
    pilotBest = null,
    candidate = original;
  function batch(move, indices, round) {
    checkDeadline(deadline);
    // Full numerical content is required: immutable identity intentionally omits
    // the very parameters being tuned. This cache lives for one calibration only.
    const candidateKey = JSON.stringify(move);
    let cases = cache.get(candidateKey);
    if (!cases) {
      cases = new Map();
      cache.set(candidateKey, cases);
    }
    const reports = indices.map((index) => {
      const selected = manifest.cases[index];
      const key = JSON.stringify(selected);
      let result = cases.get(key);
      if (!result) {
        result = evaluateCase(move, index, deadline, { round });
        if (
          result.bouts !== 1 ||
          result.results.length !== 1 ||
          result.results[0].seed !== selected.seed ||
          ![0, 1].includes(result.results[0].side)
        )
          throw Error('Adaptive evidence requires one complete independent game');
        cases.set(key, result);
        totalTicks += result.ticks;
        executedBouts++;
      } else reusedBouts++;
      return result;
    });
    return combine(reports);
  }
  function confirm(move, evaluated, round) {
    if (evaluated.bouts !== 48) throw Error('Adaptive finalists require full training');
    confirmations.push({ round, bouts: evaluated.bouts, winRate: evaluated.winRate });
    if (!training || Math.abs(evaluated.winRate - 0.5) < Math.abs(training.winRate - 0.5)) {
      best = move;
      training = evaluated;
    }
  }
  for (let round = 0; round < maxRounds; round++) {
    const before = executedBouts,
      pilot = batch(candidate, ADAPTIVE_BATCHES[0], round);
    if (!pilotBest || Math.abs(pilot.winRate - 0.5) <= Math.abs(pilotBest.winRate - 0.5))
      pilotBest = { move: candidate, round, winRate: pilot.winRate };
    let evaluated = pilot,
      direction = adaptiveDirection(evaluated);
    const batches = [
      { bouts: 12, winRate: pilot.winRate, winRateInterval95: pilot.winRateInterval95 },
    ];
    for (const indices of ADAPTIVE_BATCHES.slice(1))
      if (direction === null) {
        evaluated = batch(candidate, indices, round);
        direction = adaptiveDirection(evaluated);
        batches.push({
          bouts: evaluated.bouts,
          winRate: evaluated.winRate,
          winRateInterval95: evaluated.winRateInterval95,
        });
      }
    const confirmed = evaluated.bouts === 48;
    if (confirmed) confirm(candidate, evaluated, round);
    rounds.push({
      round,
      winRate: evaluated.winRate,
      bouts: evaluated.bouts,
      damage: candidate.templates.map((t) => t.damage.amount),
      cooldown: candidate.resource.cooldown,
    });
    exploration.push({ round, confirmed, newBouts: executedBouts - before, batches });
    if (confirmed && evaluated.winRate >= 0.4 && evaluated.winRate <= 0.6) break;
    if (round + 1 < maxRounds) candidate = tune(candidate, direction ?? evaluated.winRate > 0.5);
  }
  // Compare candidates only on equal evidence. All pilots used the same 12 bouts;
  // the selected pilot finalist now receives the same 48 games as other finalists.
  if (!confirmations.some((item) => item.round === pilotBest.round))
    confirm(
      pilotBest.move,
      batch(pilotBest.move, ADAPTIVE_BATCHES[2], pilotBest.round),
      pilotBest.round,
    );
  return {
    best,
    training,
    rounds,
    totalTicks,
    experimental: {
      revision: ADAPTIVE_TRAINING_REVISION,
      manifest,
      thresholds: ADAPTIVE_THRESHOLDS,
      exploration,
      confirmations,
      executedBouts,
      reusedBouts,
      cachedCandidates: cache.size,
      note: 'Pilot thresholds guide exploratory tuning only. Every finalist is compared on the full training manifest; admission still uses the unchanged final mechanics and independent holdout checks.',
    },
  };
}
