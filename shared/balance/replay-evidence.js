import { simulationComparison, simulationHealth } from '../sim/calibration-rules.js';
import { encodeReplayInputs, MAX_REPLAY_TICKS } from '../protocol/replay-inputs.js';
import { COMPOSED_INPUT_POLICY_REVISION, composedPolicyInput } from './composed-input-policy.js';

export const COMPOSED_COMPARISON_REVISION = 'composed-deaths-then-health-v2';
export const MAX_CALIBRATION_REPLAY_CASES = 372;
// Sorted full JSON contents are the deduplication key, never move identity/name
// or a short digest. Digests below detect reproduction errors; the server owns
// cryptographic integrity and provenance of the entire stored evidence payload.
export const canonicalEvidenceText = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
function digest() {
  let value = 0x811c9dc5;
  return {
    add(item) {
      const text = JSON.stringify(item);
      for (let i = 0; i < text.length; i++)
        value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
      value = Math.imul(value ^ 10, 0x01000193);
    },
    value: () => (value >>> 0).toString(16).padStart(8, '0'),
  };
}
export function calibrationDefinitionChecksum(definition) {
  const result = digest();
  result.add(canonicalEvidenceText(definition));
  return result.value();
}
export function composedComparison(a, b, mode) {
  if (mode === 'simulation') return simulationComparison(a, b);
  return mode === 'hill'
    ? (a.score - b.score) * 1000 + (a.kills - b.kills) * 100 + a.hp - b.hp
    : mode === 'lives'
      ? (a.lives - b.lives) * 1000 + (a.kills - b.kills) * 100 + a.hp - b.hp
      : (a.kills - b.kills) * 100 + a.hp - b.hp;
}
export function composedComparisonDetails(a, b, mode) {
  if (mode === 'simulation') {
    const difference = simulationComparison(a, b);
    return {
      difference,
      result: difference > 0 ? 1 : difference < 0 ? 0 : 0.5,
      reason: a.deaths !== b.deaths ? 'fewer-deaths' : difference ? 'remaining-hp' : 'tie',
      components: { deaths: b.deaths - a.deaths, hp: simulationHealth(a) - simulationHealth(b) },
    };
  }
  const difference = composedComparison(a, b, mode),
    components = {
      objective:
        mode === 'hill'
          ? (a.score - b.score) * 1000
          : mode === 'lives'
            ? (a.lives - b.lives) * 1000
            : 0,
      kills: (a.kills - b.kills) * 100,
      hp: a.hp - b.hp,
    },
    first = Object.entries(components).find(([, value]) => value !== 0),
    reason =
      difference === 0
        ? 'tie'
        : !first || Math.sign(first[1]) !== Math.sign(difference)
          ? 'weighted-comparison'
          : first[0] === 'objective'
            ? mode === 'hill'
              ? 'hill-score'
              : 'remaining-lives'
            : first[0] === 'hp'
              ? 'remaining-hp'
              : 'kills';
  return { difference, result: difference > 0 ? 1 : difference < 0 ? 0 : 0.5, reason, components };
}
/** Keep measured outcome statistics and game winner data, including when
 * calibration's comparator awards a different result from the game winner.
 * The final state hash covers transient fighter runtime fields.
 */
/** @param {any} state @param {any} [options] */
export function measureCalibrationReplay(
  state,
  { kind = 'duel', ownerId = 'candidate', opponentId = 'baseline', candidateMoveName } = {},
) {
  const owner = state.players.find((p) => p.id === ownerId);
  if (!owner) throw Error('Missing calibration replay owner');
  const comparison =
    kind === 'ffa'
      ? {
          comparisons: state.players
            .filter((p) => p !== owner)
            .map((p) => ({ opponentId: p.id, ...composedComparisonDetails(owner, p, state.mode) })),
          rankScore:
            1 -
            state.players.filter((p) => p !== owner && composedComparison(p, owner, state.mode) > 0)
              .length /
              3,
        }
      : composedComparisonDetails(
          owner,
          state.players.find((p) => p.id === opponentId),
          state.mode,
        );
  return {
    kind,
    ownerId,
    ...(kind === 'duel' ? { opponentId } : {}),
    ...(candidateMoveName
      ? {
          candidateMoveName,
          activations: state.telemetry.perMove[candidateMoveName]?.activations || 0,
        }
      : {}),
    ...comparison,
    ended: state.ended,
    winner: state.winner,
    winners: state.winners,
    winnerTeam: state.winnerTeam,
    players: state.players.map((player) =>
      Object.fromEntries(
        ['id', 'hp', 'maxHp', 'kills', 'deaths', 'score', 'lives', 'dead', 'team']
          .filter((key) => Object.hasOwn(player, key))
          .map((key) => [key, player[key]]),
      ),
    ),
  };
}
/** Resolved defaults of calibration matches. Omission-sensitive revision flags
 * retain their original presence: adding mechanicsVersion changes state fields.
 */
export function calibrationReplayHeader(options, state) {
  return structuredClone({
    ...options,
    stage: state.stage,
    mapRevision: state.map.revision,
    seed: state.seed,
    mode: state.mode,
    timeLimit: state.timeLimit,
    shrinkAfter: state.shrinkAfter,
    lives: state.players[0].lives,
    botDifficulty: state.botDifficulty,
    meleeEnabled: state.meleeEnabled,
    healthPercent: state.healthPercent,
    teamBattle: state.teamBattle,
    speedPercent: state.speedPercent ?? 100,
    dashEnabled: state.dashEnabled !== false,
    shieldEnabled: state.shieldEnabled !== false,
    friendlyFire: state.friendlyFire !== false,
    itemDrops: state.itemDrops ?? 'off',
  });
}
export function createCalibrationReplayEvidence() {
  return {
    format: 1,
    engineBuild: null,
    inputPolicyRevision: COMPOSED_INPUT_POLICY_REVISION,
    comparisonRevision: COMPOSED_COMPARISON_REVISION,
    definitions: [],
    cases: [],
  };
}
export function beginCalibrationReplayCase(
  evidence,
  { engine, state, header, candidateDefinition, phase, round = null, pairId, variant, inputPolicy },
) {
  if (!evidence || evidence.unavailable) return null;
  if (evidence.cases.length >= MAX_CALIBRATION_REPLAY_CASES) {
    evidence.unavailable = 'case-limit';
    evidence.cases = [];
    evidence.definitions = [];
    return null;
  }
  if (evidence.engineBuild && evidence.engineBuild !== state.engineBuild)
    throw Error('Calibration engine build changed');
  evidence.engineBuild = state.engineBuild;
  const pin = (definition) => {
    const key = canonicalEvidenceText(definition);
    let found = evidence.definitions.find(
      (entry) => canonicalEvidenceText(entry.definition) === key,
    );
    if (!found) {
      found = {
        id: `d${evidence.definitions.length}`,
        definition: structuredClone(definition),
        checksum: calibrationDefinitionChecksum(definition),
      };
      evidence.definitions.push(found);
    }
    return found.id;
  };
  const row = {
    id: `c${evidence.cases.length}`,
    phase,
    round,
    candidateDefinitionId: pin(candidateDefinition),
    pairId,
    variant,
    header: {
      ...structuredClone(header),
      players: header.players.map(({ loadout, ...player }) => ({
        ...player,
        loadoutDefinitionIds: loadout.map(pin),
      })),
    },
    inputPolicy: structuredClone(inputPolicy),
  };
  evidence.cases.push(row);
  const inputs = digest(),
    trajectory = digest();
  return {
    step(input, current) {
      inputs.add(input);
      if (current.tick % 30 === 0) trajectory.add([current.tick, engine.stateHash(current)]);
    },
    finish(measuredResult) {
      row.final = { tick: state.tick, hash: engine.stateHash(state) };
      row.inputDigest = inputs.value();
      row.trajectoryDigest = trajectory.value();
      row.measuredResult = structuredClone(measuredResult);
      return row.id;
    },
  };
}
export function expandCalibrationReplayHeader(evidence, row) {
  const ids = new Set();
  for (const entry of evidence.definitions) {
    if (ids.has(entry.id)) throw Error('Duplicate calibration definition ID');
    if (entry.checksum !== calibrationDefinitionChecksum(entry.definition))
      throw Error('Calibration definition checksum mismatch');
    ids.add(entry.id);
  }
  const definition = (id) => {
    const entry = evidence.definitions.find((item) => item.id === id);
    if (!entry) throw Error('Missing calibration definition');
    return structuredClone(entry.definition);
  };
  definition(row.candidateDefinitionId);
  return {
    ...structuredClone(row.header),
    players: row.header.players.map(({ loadoutDefinitionIds, ...player }) => ({
      ...player,
      loadout: loadoutDefinitionIds.map(definition),
    })),
  };
}
/** Execute only the explicitly supplied engine, never today's engine fallback.
 * Inputs are retained only in this on-demand recorded-game reconstruction.
 */
export function reconstructCalibrationReplay(
  engine,
  evidence,
  caseId,
  { checkDeadline = () => {} } = {},
) {
  if (evidence?.format !== 1 || evidence.unavailable)
    throw Error('Calibration replay evidence unavailable');
  if (
    evidence.inputPolicyRevision !== COMPOSED_INPUT_POLICY_REVISION ||
    ![COMPOSED_COMPARISON_REVISION, 'composed-weighted-outcome-v1'].includes(
      evidence.comparisonRevision,
    )
  )
    throw Error('Unknown calibration replay policy');
  const row = evidence.cases.find((entry) => entry.id === caseId);
  if (!row || evidence.cases.filter((entry) => entry.id === caseId).length !== 1)
    throw Error('Unknown calibration replay case');
  if (row.inputPolicy?.revision !== evidence.inputPolicyRevision)
    throw Error('Unknown calibration input policy');
  if (
    !Number.isSafeInteger(row.final?.tick) ||
    row.final.tick < 1 ||
    row.final.tick > MAX_REPLAY_TICKS
  )
    throw Error('Invalid calibration replay duration');
  const header = expandCalibrationReplayHeader(evidence, row),
    state = engine.createMatch(structuredClone(header));
  if (state.engineBuild !== evidence.engineBuild)
    throw Error('Calibration replay engine build mismatch');
  const inputs = [],
    checkpoints = [],
    inputDigest = digest(),
    trajectoryDigest = digest();
  while (!state.ended && state.tick < row.final.tick) {
    if (state.tick % 30 === 0) checkDeadline();
    const input = Object.fromEntries(
      state.players.map((p) => [p.id, composedPolicyInput(engine, state, p.id, row.inputPolicy)]),
    );
    inputDigest.add(input);
    inputs.push(structuredClone(input));
    engine.step(state, input);
    if (state.tick % 30 === 0) {
      const point = [state.tick, engine.stateHash(state)];
      checkpoints.push(point);
      trajectoryDigest.add(point);
    }
  }
  const final = { tick: state.tick, hash: engine.stateHash(state) },
    measured = measureCalibrationReplay(state, row.measuredResult);
  for (const [kind, expected, actual] of [
    ['inputs', row.inputDigest, inputDigest.value()],
    ['trajectory', row.trajectoryDigest, trajectoryDigest.value()],
    ['final', row.final, final],
    ['measured result', row.measuredResult, measured],
  ])
    if (canonicalEvidenceText(expected) !== canonicalEvidenceText(actual))
      throw Error(`Calibration replay ${kind} mismatch`);
  return {
    format: 1,
    engineBuild: evidence.engineBuild,
    header,
    inputs: encodeReplayInputs(
      inputs,
      header.players.map((p) => p.id),
    ),
    checkpoints,
    final,
  };
}
