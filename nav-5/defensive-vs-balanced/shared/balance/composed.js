// Admission and calibration for Composed moves: scripted mechanics scenarios,
// then independent bot duels against reference moves in a fixed arena, tuning the
// numbers calibration may change until the win rate is in range.
import * as engine from '../sim/composed/engine.js';
import { compileMove } from '../sim/composed/compiler.js';
import { COMPOSED_BASE_MOVES } from '../content/composed/fixtures.js';
import {
  validateComposedMove,
  composedMoveIdentity,
  graphProof,
} from '../content/composed/schema.js';
import { SIMULATION_MAP } from '../content/maps/simulation-map.js';
import { hueOf, hueTurn, withHue, MAX_HUE_SHIFT } from '../content/composed/color.js';
import { componentScenarios, utilityProbeInput } from './composed-scenarios.js';
import { square } from '../sim/exact-math.js';
import { COMPOSED_INPUT_POLICY_REVISION, composedPolicyInput } from './composed-input-policy.js';
import {
  beginCalibrationReplayCase,
  calibrationReplayHeader,
  createCalibrationReplayEvidence,
  measureCalibrationReplay,
  composedComparison as comparison,
  composedComparisonDetails,
} from './replay-evidence.js';
import { checkDeadline, deadlineIn } from './deadline.js';
import {
  ADAPTIVE_TRAINING_REVISION,
  adaptiveManifest,
  runAdaptiveTraining,
} from './adaptive-training.js';
/** Names the calibration method; stored with every calibrated move. */
export const COMPOSED_CALIBRATION_REVISION =
  'component-capabilities-and-standard-duels-v5-builtins';
/** One revision-pinned arena for all calibration duels. */
export const COMPOSED_CALIBRATION_MAPS = Object.freeze([
  Object.freeze({ id: SIMULATION_MAP.id, revision: SIMULATION_MAP.revision }),
]);
const SCENARIO_REVISION = 5;
const references = COMPOSED_BASE_MOVES.slice(0, 9);
const { step } = engine;
export const createComposedCalibrationMatch = (options) =>
  engine.createMatch({ ...options, mode: 'simulation' });
const calibrationPolicy = () => ({
  revision: COMPOSED_CALIBRATION_REVISION,
  mode: 'simulation',
  seconds: 25,
  outcome: 'fewest-deaths-then-remaining-health',
  spawns: 'seeded-independent-opposing-sides',
  botDifficulty: 'hard',
  swipeEnabled: true,
  shootEnabled: true,
  scenarioBotDifficulty: 'normal',
  mapPins: COMPOSED_CALIBRATION_MAPS,
  references: references.map((m) => m.name),
});
const telemetry = (state, move) => state.telemetry.perMove[move.name] || {};
const addStats = (total, stats) => {
  for (const [key, value] of Object.entries(stats))
    if (Number.isFinite(value)) total[key] = (total[key] || 0) + value;
};
const healthy = (state) =>
  state.players.every((p) => [p.x, p.y, p.hp, p.shield].every(Number.isFinite)) &&
  !state.contentFaults.length;
const player = (id, loadout) => ({ id, loadout });
const withCompanion = (move, companion) =>
  companion && companion.name !== move.name ? [move, companion] : [move];
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
function utilityMove(move) {
  const plan = compileMove(move),
    root = plan.templates[move.root];
  return (
    plan.affordances.force ||
    plan.affordances.setup === 'pair' ||
    plan.affordances.trail ||
    root.motion.kind === 'stationary' ||
    (root.motion.speed < 3 && plan.affordances.moving)
  );
}
function initialProbe(move, count = 2) {
  // Scripted mechanics admission does not depend on combat difficulty.
  const state = engine.createMatch({
    botDifficulty: 'normal',
    swipeEnabled: false,
    shootEnabled: false,
    mapRevision: 1,
    players: Array.from({ length: count }, (_, i) =>
      player(i ? `target${i}` : 'candidate', [move]),
    ),
    stage: 'foundry',
    mode: 'timed',
    timeLimit: 30,
    seed: 19831,
  });
  state.players.forEach((p, i) =>
    Object.assign(p, {
      x: i ? 444 : 400,
      y: 320,
      hp: 10000,
      maxHp: 10000,
      hardProtection: 0,
      invuln: 0,
      impactRecovery: 0,
      vx: 0,
      vy: 0,
    }),
  );
  return state;
}
function probeInput(move, tick, state) {
  const candidate = state.players[0],
    root = move.templates.find((t) => t.id === move.root);
  let pressed = tick === 0;
  if (move.setup.kind === 'pair') {
    const distance = (move.setup.minDistance + move.setup.maxDistance) / 2;
    const second =
      move.activation.windup + Math.max(move.resource.cooldown, move.activation.recovery) + 2;
    candidate.x = tick < second ? 300 : 300 + distance;
    state.players[1].x = 300 + distance / 2;
    pressed ||= tick === second;
  }
  const aimedPlacement = root.origin === 'aim_point_clamped';
  const input = {
    x: 0,
    y: 0,
    aimX: aimedPlacement ? 400 : state.players[1].x,
    aimY: 320,
    heldSlots: move.activation.mode === 'hold' && tick < 90 ? [0] : [],
    pressedSlots: pressed ? [0] : [],
  };
  return utilityProbeInput(move, tick, state, input) ?? input;
}

/** Mechanical admission is measured separately from win rate; missing exercise is failure. */
export function evaluateComposedScenarios(raw, { deadline = Infinity } = {}) {
  const move = validateComposedMove(raw),
    plan = compileMove(move),
    scenarios = [],
    stats = {},
    probes = [],
    faults = [];
  let enemyDamage = 0,
    peakObjects = 0,
    activationsAtRelease = 0,
    remaining = 0,
    finite = true;
  const rootTemplate = plan.templates[move.root],
    derived = rootTemplate.geometry.flatMap((shape) => [
      shape.innerRadius + 14 + rootTemplate.motion.offset,
      (shape.innerRadius + shape.radius) / 2 + rootTemplate.motion.offset,
    ]);
  for (const binding of rootTemplate.events)
    if (binding.when === 'interval')
      derived.push(
        15 +
          rootTemplate.physicalRadius +
          rootTemplate.motion.speed * Math.max(1, binding.at - rootTemplate.arm),
      );
  for (const template of move.templates)
    if (template.force.direction !== 'none') derived.push(template.force.radius / 2);
  const distances =
    move.setup.kind === 'pair'
      ? [44]
      : [
          ...new Set([
            20,
            44,
            80,
            140,
            220,
            480,
            ...derived.map((distance) => Math.round(Math.max(16, Math.min(500, distance)))),
          ]),
        ];
  for (const distance of distances) {
    const state = initialProbe(move);
    state.players[1].x = 400 + distance;
    let damage = 0;
    for (let tick = 0; tick < 600; tick++) {
      if (tick % 60 === 0) checkDeadline(deadline);
      step(state, { candidate: probeInput(move, tick, state) });
      for (const event of state.events)
        if (event.type === 'hit' && event.playerId === 'target1' && event.owner === 'candidate')
          damage += event.damage;
      peakObjects = Math.max(peakObjects, state.entities.length);
      if (tick === 89) activationsAtRelease += telemetry(state, move).activations || 0;
    }
    const measured = telemetry(state, move);
    addStats(stats, measured);
    enemyDamage += damage;
    probes.push({ distance, enemyDamage: damage, forceTicks: measured.forceTicks || 0 });
    remaining += state.entities.length + state.reservations.length;
    finite &&= healthy(state);
    faults.push(...state.contentFaults);
  }
  scenarios.push({
    name: 'activation-and-usefulness',
    passed: stats.activations > 0 && (enemyDamage > 0 || stats.forceTicks > 0),
    activations: stats.activations || 0,
    enemyDamage,
    forceTicks: stats.forceTicks || 0,
    probes,
  });
  for (const [needed, counter, name] of [
    [move.setup.kind === 'pair', 'pairs', 'two-distinct-anchor-placements'],
    [plan.affordances.explosive, 'detonations', 'terminal-continuation'],
    [plan.affordances.trail, 'trailSegments', 'bounded-trail-emission'],
    [plan.affordances.force, 'forceTicks', 'force-application'],
  ]) {
    if (needed) scenarios.push({ name, passed: stats[counter] > 0, observed: stats[counter] || 0 });
  }
  scenarios.push({
    name: 'finite-occupancy-after-release',
    passed: remaining === 0 && finite,
    remaining,
    peakObjects,
    faults,
  });
  if (move.activation.mode === 'hold')
    scenarios.push({
      name: 'release-stops-new-emission',
      passed: stats.activations === activationsAtRelease,
      atRelease: activationsAtRelease,
      final: stats.activations,
    });

  const shield = initialProbe(move);
  for (let tick = 0; tick < 12; tick++)
    step(shield, {
      candidate: { shield: true, aimX: 444, aimY: 320, heldSlots: [0], pressedSlots: [0] },
    });
  const duringShield = telemetry(shield, move).activations || 0;
  for (let tick = 0; tick < 7; tick++)
    step(shield, {
      candidate: { shield: false, aimX: 444, aimY: 320, heldSlots: [0], pressedSlots: [0] },
    });
  scenarios.push({
    name: 'shield-and-release-cancel-emission',
    passed: duringShield === 0 && !(telemetry(shield, move).activations > 0),
    activations: telemetry(shield, move).activations || 0,
  });

  const spam = initialProbe(move, 4);
  let peak = 0,
    peakOwned = 0;
  spam.players.forEach((p, i) =>
    Object.assign(p, { x: [360, 600, 600, 360][i], y: [280, 360, 280, 360][i] }),
  );
  for (let tick = 0; tick < 360; tick++) {
    if (tick % 60 === 0) checkDeadline(deadline);
    const inputs = Object.fromEntries(
      spam.players.map((p, i) => [
        p.id,
        {
          aimX: spam.players[(i + 1) % 4].x,
          aimY: spam.players[(i + 1) % 4].y,
          heldSlots: [0],
          pressedSlots: tick % 2 ? [] : [0],
        },
      ]),
    );
    step(spam, inputs);
    peak = Math.max(peak, spam.entities.length);
    for (const p of spam.players)
      peakOwned = Math.max(peakOwned, spam.entities.filter((e) => e.owner === p.id).length);
  }
  scenarios.push({
    name: 'four-owner-held-and-tap-occupancy',
    passed: peak <= 96 && peakOwned <= 24 && healthy(spam),
    peak,
    peakOwned,
    faults: spam.contentFaults,
  });

  if (plan.affordances.force) {
    for (const owners of [1, 2]) {
      const escape = initialProbe(move, owners + 1),
        root = plan.templates[move.root],
        beginEscape = move.activation.windup + root.arm + 8;
      const startX =
        400 +
        Math.min(
          44,
          ...move.templates
            .filter((template) => template.force.direction !== 'none')
            .map((template) => template.force.radius * 0.7),
        );
      escape.players[1].x = startX;
      if (owners === 2) Object.assign(escape.players[2], { x: 400, y: 320 });
      for (let tick = 0; tick < 180; tick++) {
        const input = probeInput(move, tick, escape),
          inputs = { candidate: input, target1: { x: tick >= beginEscape ? 1 : 0, y: 0 } };
        if (owners === 2) inputs.target2 = input;
        step(escape, inputs);
      }
      scenarios.push({
        name:
          owners === 1 ? 'field-allows-directed-escape' : 'stacked-fields-allow-directed-escape',
        passed: escape.players[1].x - startX > 150 && healthy(escape),
        distance: escape.players[1].x - startX,
      });
    }
  }
  const extraTicks = componentScenarios({ move, scenarios, stats, deadline }) || 0;
  return {
    accepted: scenarios.every((scenario) => scenario.passed),
    scenarioRevision: SCENARIO_REVISION,
    activations: stats.activations || 0,
    telemetry: stats,
    scenarios,
    ticks: 600 * distances.length + 19 + 360 + (plan.affordances.force ? 360 : 0) + extraTicks,
  };
}

function companionFor(a, b) {
  return (
    references.find(
      (move) => move.activation.mode === 'hold' && move.name !== a.name && move.name !== b.name,
    ) || references.find((move) => move.name !== a.name && move.name !== b.name)
  );
}
/** Independent seeded duels, all under the same simulation rules. */
export function evaluateComposedMove(raw, options = {}) {
  return evaluateComposedCases(raw, options);
}

/** The ordinary training schedule, sourced from the same cases as full training. */
export function composedTrainingManifest(raw) {
  const move = validateComposedMove(raw),
    companion = utilityMove(move);
  return adaptiveManifest(
    Array.from({ length: 48 }, (_, group) => ({
      group,
      ...trainingCase({ group, seed: 1301, move, companion }),
    })),
  );
}

/** One independent game, for the bounded offline selector only. */
export function evaluateComposedTrainingCase(
  raw,
  group,
  { deadline = Infinity, replayEvidence = null, replayRound = null } = {},
) {
  if (!Number.isInteger(group) || group < 0 || group >= 48) throw Error('Invalid training case');
  return evaluateComposedCases(raw, { bouts: 1, deadline, replayEvidence, replayRound }, [group]);
}

function evaluateComposedCases(
  raw,
  {
    bouts = 48,
    seed = 1301,
    companion = utilityMove(raw),
    deadline = Infinity,
    replayEvidence = null,
    replayPhase = 'training',
    replayRound = null,
  } = {},
  caseIndices = null,
) {
  const move = validateComposedMove(raw),
    results = [],
    stats = {},
    modes = {},
    groups = [];
  let wins = 0,
    losses = 0,
    ties = 0,
    ticks = 0;
  for (let group = 0; group < bouts; group++) {
    const selected = trainingCase({
        group: caseIndices?.[group] ?? group,
        seed,
        move,
        companion,
      }),
      { reference, companion: common, stage, mode, style } = selected;
    checkDeadline(deadline);
    const candidates = [
      player('candidate', withCompanion(move, common)),
      player('baseline', withCompanion(reference, common)),
    ];
    const matchOptions = {
        players: candidates,
        stage,
        mapRevision: selected.mapRevision,
        mode,
        timeLimit: selected.seconds,
        shrinkAfter: selected.shrinkAfter,
        lives: selected.lives,
        seed: selected.seed,
      },
      state = createComposedCalibrationMatch(matchOptions),
      side = state.players[0].x < SIMULATION_MAP.width / 2 ? 0 : 1,
      inputPolicy = { revision: COMPOSED_INPUT_POLICY_REVISION, style },
      capture = replayEvidence
        ? beginCalibrationReplayCase(replayEvidence, {
            engine,
            state,
            header: calibrationReplayHeader(matchOptions, state),
            candidateDefinition: move,
            phase: replayPhase,
            round: replayRound,
            pairId: `case-${caseIndices?.[group] ?? group}`,
            variant: `side-${side}`,
            inputPolicy,
          })
        : null;
    const companionEvidence = common
      ? {
          candidate: { activations: 0, damage: 0 },
          baseline: { activations: 0, damage: 0 },
        }
      : null;
    while (!state.ended) {
      const input = Object.fromEntries(
        state.players.map((p) => [p.id, composedPolicyInput(engine, state, p.id, inputPolicy)]),
      );
      step(state, input);
      if (companionEvidence)
        for (const event of state.events) {
          if (event.move?.name !== common.name) continue;
          if (event.type === 'cast') companionEvidence[event.playerId].activations++;
          if (event.type === 'hit' && event.owner !== event.playerId)
            companionEvidence[event.owner].damage += event.damage;
        }
      capture?.step(input, state);
      ticks++;
    }
    if (!healthy(state))
      throw Error(
        `Content fault during Composed balance simulation (${stage}/${mode}, seed ${state.seed}): ${JSON.stringify(state.contentFaults.slice(0, 2)) || 'nonfinite state'}`,
      );
    const a = state.players.find((p) => p.id === 'candidate'),
      b = state.players.find((p) => p.id === 'baseline'),
      difference = comparison(a, b, mode),
      outcome = difference > 0 ? 1 : difference < 0 ? 0 : 0.5;
    if (outcome === 1) wins++;
    else if (outcome === 0) losses++;
    else ties++;
    groups.push(outcome);
    (modes[mode] ||= []).push(outcome);
    addStats(stats, telemetry(state, move));
    const replayCaseId = capture?.finish(
      measureCalibrationReplay(state, { candidateMoveName: move.name }),
    );
    results.push({
      ...(replayCaseId ? { replayCaseId } : {}),
      comparison: composedComparisonDetails(a, b, mode),
      hp: a.hp,
      baselineHp: b.hp,
      baselineKills: b.kills,
      baselineDeaths: b.deaths,
      score: a.score,
      baselineScore: b.score,
      lives: a.lives,
      baselineLives: b.lives,
      reference: reference.name,
      stage,
      mode,
      seed: state.seed,
      side,
      style,
      companion: common?.name || null,
      ...(companionEvidence ? { companionEvidence } : {}),
      result: outcome,
      kills: a.kills,
      deaths: a.deaths,
      activations: telemetry(state, move).activations || 0,
    });
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
    telemetry: stats,
    sampleCount: groups.length,
    winRateInterval95: [Math.max(0, winRate - margin), Math.min(1, winRate + margin)],
    modes: Object.fromEntries(
      Object.entries(modes).map(([key, values]) => [
        key,
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

export function composedStaticMeasures(raw) {
  const move = validateComposedMove(raw),
    proof = graphProof(move),
    plan = compileMove(move);
  const burstDamageUpperBound =
    proof.reservation * Math.max(...move.templates.map((t) => t.damage.amount));
  const magazineDuty =
    move.resource.kind === 'magazine'
      ? (move.resource.capacity * move.resource.cooldown) /
        (move.resource.capacity * move.resource.cooldown + move.resource.reload)
      : 1;
  return {
    castReservation: proof.reservation,
    graphDepth: proof.depth,
    range: plan.affordances.range,
    warningTicks: plan.affordances.warning,
    recoveryTicks: move.activation.recovery,
    cadenceTicks: move.resource.cooldown,
    reloadTicks: move.resource.reload,
    burstDamageUpperBound,
    sustainedDamageUpperBoundPerSecond:
      ((burstDamageUpperBound * 30) / move.resource.cooldown) * magazineDuty,
    magazineDuty,
    maxImpactDamage: Math.max(
      0,
      ...move.templates.filter((t) => t.damage.policy === 'impact').map((t) => t.damage.amount),
    ),
    peakShieldPressure: Math.max(...move.templates.map((t) => t.damage.shield)),
    forceMagnitude: Math.max(...move.templates.map((t) => t.force.strength)),
    maxLifetime: Math.max(...move.templates.map((t) => t.lifetime)),
    setup: move.setup.kind,
    utilityLoadout: utilityMove(move),
  };
}
/**
 * Turns an unlocked core color 10 degrees toward yellow for a strong move, or
 * away for a weak one, within MAX_HUE_SHIFT of the original. Yellow keeps both
 * red and green high, which raises self and ally damage (shared/sim/teams.js).
 */
function tuneColor(next, strong, original) {
  const start = hueOf(original.coreColor),
    hue = hueOf(next.coreColor);
  if (next.colorLocked !== false || start === null || hue === null) return;
  const toward = hueTurn(hue, 60),
    step = (toward < 0 ? -1 : 1) * (strong ? Math.min(10, Math.abs(toward)) : -10);
  let turn = Math.trunc(
    Math.max(-MAX_HUE_SHIFT, Math.min(MAX_HUE_SHIFT, hueTurn(start, hue + step))),
  );
  // Channels are whole numbers; step back until the rounded color is in range.
  while (turn && !hueWithin(original.coreColor, withHue(original.coreColor, start + turn)))
    turn -= Math.sign(turn);
  next.coreColor = turn ? withHue(original.coreColor, start + turn) : original.coreColor;
}
/** Whether tuning kept `color` within MAX_HUE_SHIFT of `originalColor`. */
export function hueWithin(originalColor, color) {
  const start = hueOf(originalColor),
    hue = hueOf(color);
  return start === null
    ? hue === null || color.toLowerCase() === originalColor.toLowerCase()
    : hue !== null && Math.abs(hueTurn(start, hue)) <= MAX_HUE_SHIFT;
}
/** One calibration step: weaker when `strong`, stronger otherwise. */
export function tune(move, strong, original = move) {
  const next = structuredClone(move),
    factor = strong ? 0.83 : 1.2;
  for (const template of next.templates) {
    const maxDamage = template.damage.policy === 'rapid' ? 8 : 38;
    if (template.damage.amount > 0)
      template.damage.amount = Math.max(
        0.25,
        Math.min(maxDamage, Math.round(template.damage.amount * factor * 4) / 4),
      );
    if (template.damage.shield > 0)
      template.damage.shield = Math.max(
        0.25,
        Math.min(48, Math.round(template.damage.shield * factor * 4) / 4),
      );
    if (template.force.direction !== 'none')
      template.force.strength = Math.max(
        0.05,
        Math.min(1.2, Math.round(template.force.strength * factor * 100) / 100),
      );
  }
  next.resource.cooldown = Math.max(
    3,
    Math.min(180, Math.round(next.resource.cooldown * (strong ? 1.16 : 0.84))),
  );
  next.resource.reload = Math.max(
    15,
    Math.min(180, Math.round(next.resource.reload * (strong ? 1.12 : 0.88))),
  );
  next.activation.recovery = Math.max(
    0,
    Math.min(45, next.activation.recovery + (strong ? 1 : -1)),
  );
  tuneColor(next, strong, original);
  // An actor's own attack stays light; its health is what calibration moves.
  for (const template of next.templates)
    if (template.actor.kind !== 'none') {
      template.damage.amount = Math.min(12, template.damage.amount);
      template.damage.shield = Math.min(12, template.damage.shield);
      template.health = Math.max(
        12,
        Math.min(50, Math.round(template.health * (strong ? 0.9 : 1.1))),
      );
    }
  return validateComposedMove(next);
}
/**
 * @param {any} raw
 * @param {{bouts?: number, holdoutBouts?: number, maxRounds?: number, deadlineMs?: number,
 *   trainingPolicy?: 'full' | 'adaptive-v1', onPhase?: (phase: string) => void}} [options]
 */
export function calibrateComposedMove(
  raw,
  {
    bouts = 48,
    holdoutBouts = 48,
    maxRounds = 6,
    deadlineMs = 45000,
    onPhase,
    trainingPolicy = 'full',
  } = {},
) {
  if (!['full', 'adaptive-v1'].includes(trainingPolicy))
    throw Error('Unknown Composed training policy');
  const adaptive = trainingPolicy === 'adaptive-v1';
  if (
    adaptive &&
    (bouts !== 48 ||
      holdoutBouts !== 48 ||
      !Number.isInteger(maxRounds) ||
      maxRounds < 1 ||
      maxRounds > 6)
  )
    throw Error('Adaptive training retains 48 training/holdout bouts and one to six rounds');
  const experiment = adaptive
    ? { trainingPolicy, experimentalRevision: ADAPTIVE_TRAINING_REVISION }
    : {};
  const phase = (name) => {
      try {
        onPhase?.(name);
      } catch {}
    },
    original = validateComposedMove(raw),
    deadline = deadlineIn(deadlineMs),
    replayEvidence = createCalibrationReplayEvidence();
  phase('mechanics_initial');
  const evidence = evaluateComposedScenarios(original, { deadline });
  let rounds = [];
  if (!evidence.accepted)
    return {
      move: original,
      report: {
        method: adaptive ? ADAPTIVE_TRAINING_REVISION : COMPOSED_CALIBRATION_REVISION,
        ...experiment,
        accepted: false,
        evidence,
        rounds,
        reason: 'mechanics-scenario-failed',
        replayEvidence,
        calibrationPolicy: calibrationPolicy(),
      },
    };
  let candidate = original,
    best = original,
    training = null,
    totalTicks = evidence.ticks,
    experimental = null;
  phase('training');
  if (adaptive) {
    const selected = runAdaptiveTraining(original, {
      maxRounds,
      deadline,
      tune: (move, strong) => tune(move, strong, original),
      manifest: composedTrainingManifest(original),
      evaluateCase: (move, group, _deadline, context) =>
        evaluateComposedTrainingCase(move, group, {
          deadline,
          replayEvidence,
          replayRound: context.round,
        }),
    });
    ({ best, training, rounds, experimental } = selected);
    totalTicks += selected.totalTicks;
  } else {
    for (let round = 0; round < maxRounds; round++) {
      const evaluated = evaluateComposedMove(candidate, {
        bouts,
        deadline,
        replayEvidence,
        replayRound: round,
      });
      totalTicks += evaluated.ticks;
      rounds.push({
        round,
        winRate: evaluated.winRate,
        bouts: evaluated.bouts,
        damage: candidate.templates.map((t) => t.damage.amount),
        cooldown: candidate.resource.cooldown,
      });
      if (!training || Math.abs(evaluated.winRate - 0.5) < Math.abs(training.winRate - 0.5)) {
        best = candidate;
        training = evaluated;
      }
      if (evaluated.winRate >= 0.4 && evaluated.winRate <= 0.6) break;
      candidate = tune(candidate, evaluated.winRate > 0.5, original);
    }
  }
  if (JSON.stringify(composedMoveIdentity(original)) !== JSON.stringify(composedMoveIdentity(best)))
    throw Error('Calibration modified component identity');
  if (!hueWithin(original.coreColor, best.coreColor))
    throw Error('Calibration turned the core color too far');
  phase('mechanics_final');
  const finalEvidence = evaluateComposedScenarios(best, { deadline });
  phase('holdout');
  const holdout = evaluateComposedMove(best, {
    bouts: holdoutBouts,
    replayEvidence,
    replayPhase: 'holdout',
    seed: 28031,
    deadline,
  });
  phase('companion');
  const companion = evaluateComposedMove(best, {
    bouts: 12,
    replayEvidence,
    replayPhase: 'companion',
    seed: 81013,
    companion: true,
    deadline,
  });
  totalTicks += finalEvidence.ticks + holdout.ticks + companion.ticks;
  const accepted =
    finalEvidence.accepted &&
    holdout.bouts >= holdoutBouts &&
    holdout.winRate >= 0.3 &&
    holdout.winRate <= 0.7 &&
    holdout.telemetry.activations > 0;
  return {
    move: best,
    report: {
      method: adaptive ? ADAPTIVE_TRAINING_REVISION : COMPOSED_CALIBRATION_REVISION,
      ...experiment,
      ...(experimental ? { experimental } : {}),
      target: [0.4, 0.6],
      acceptance: [0.3, 0.7],
      accepted,
      evidence: finalEvidence,
      analytical: composedStaticMeasures(best),
      training,
      holdout,
      companion,
      rounds,
      totalTicks,
      replayEvidence,
      calibrationPolicy: calibrationPolicy(),
      notes:
        'Scripted scenarios and independent 25-second duels are admission guardrails, not a guarantee of human balance. Fewer deaths wins; remaining health breaks ties. Utility moves are evaluated with the same companion on both sides.',
    },
  };
}

/** The opponent, companion and seed of one independent duel. */
function trainingCase({ group, seed, move, companion }) {
  const reference = references[group % references.length],
    map = SIMULATION_MAP,
    common = companion ? companionFor(move, reference) : null;
  return {
    reference,
    companion: common || null,
    stage: map.id,
    mapRevision: map.revision,
    mode: 'simulation',
    style: ['balanced', 'aggressive', 'defensive'][Math.floor(group / 3) % 3],
    seed: seed + group * 7919,
    seconds: 25,
    shrinkAfter: 0,
    lives: 3,
  };
}
