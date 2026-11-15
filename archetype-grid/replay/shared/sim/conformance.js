import { decodeReplayInputs, replayInputCount } from '../protocol/replay-inputs.js';

/** A recorded game is also a replay: exact creation options and one input object per tick.
 * Pauses annotate time with no simulation step; resumeTicks exercise JSON snapshot loading.
 * This module has no filesystem, clock, bot policy or dependency on a particular engine.
 */
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{8}$/.test(value);
const mismatch = (kind, tick, expected, actual) => ({ kind, tick, expected, actual });

/** Validate the portable format before executing untrusted replay data. */
export function validateRecordedGame(game) {
  if (!object(game) || game.format !== 1) return mismatch('format', 0, 1, game?.format);
  if (typeof game.engineBuild !== 'string' || !/^[a-z]+-b[1-9][0-9]*$/.test(game.engineBuild))
    return mismatch('engineBuild', 0, 'named engine build', game.engineBuild);
  const inputCount = replayInputCount(
    game.inputs,
    Array.isArray(game.header?.players) ? game.header.players.map((player) => player?.id) : [],
  );
  if (!object(game.header) || inputCount === null)
    return mismatch('inputs', 0, 'header and per-tick input objects', null);
  if (
    !object(game.final) ||
    !Number.isSafeInteger(game.final.tick) ||
    game.final.tick !== inputCount ||
    !hash(game.final.hash)
  )
    return mismatch('final', 0, 'input count and final hash', game.final);
  if (!Array.isArray(game.checkpoints) || game.checkpoints.length !== Math.floor(inputCount / 30))
    return mismatch('checkpoints', 0, 'one checkpoint every 30 ticks', game.checkpoints?.length);
  for (let i = 0; i < game.checkpoints.length; i++) {
    const checkpoint = game.checkpoints[i],
      tick = (i + 1) * 30;
    if (
      !Array.isArray(checkpoint) ||
      checkpoint.length !== 2 ||
      checkpoint[0] !== tick ||
      !hash(checkpoint[1])
    )
      return mismatch('checkpoints', tick, 'ordered tick/hash pair', checkpoint);
  }
  if (
    game.resumeTicks !== undefined &&
    (!Array.isArray(game.resumeTicks) ||
      game.resumeTicks.some(
        (tick, i, list) =>
          !Number.isSafeInteger(tick) ||
          tick <= 0 ||
          tick >= inputCount ||
          (i > 0 && list[i - 1] >= tick),
      ))
  )
    return mismatch('resumeTicks', 0, 'increasing interior tick numbers', game.resumeTicks);
  if (
    game.pauses !== undefined &&
    (!Array.isArray(game.pauses) ||
      game.pauses.some(
        (pause) =>
          !object(pause) ||
          !Number.isSafeInteger(pause.afterTick) ||
          pause.afterTick < 0 ||
          pause.afterTick >= inputCount ||
          !Number.isSafeInteger(pause.durationMs) ||
          pause.durationMs < 0,
      ))
  )
    return mismatch('pauses', 0, 'between-tick pause annotations', game.pauses);
  return null;
}

/** Return the first mismatch, or null. State-field coverage is checked at every checkpoint. */
export function runRecordedGame(engine, game) {
  const invalid = validateRecordedGame(game);
  if (invalid) return invalid;
  let state,
    tick = 0;
  try {
    state = engine.createMatch(structuredClone(game.header));
    if (state.engineBuild !== game.engineBuild)
      return mismatch('engineBuild', 0, game.engineBuild, state.engineBuild);
    const initialUnlisted = engine.unlistedStateFields(state);
    if (initialUnlisted.length) return mismatch('unlistedStateFields', 0, [], initialUnlisted);
    const resumes = new Set(game.resumeTicks || []);
    const inputs = Array.isArray(game.inputs) ? game.inputs : decodeReplayInputs(game.inputs);
    for (const input of inputs) {
      engine.step(state, structuredClone(input));
      tick++;
      if (state.tick !== tick) return mismatch('tick', tick, tick, state.tick);
      if (tick % 30 === 0) {
        const unlisted = engine.unlistedStateFields(state);
        if (unlisted.length) return mismatch('unlistedStateFields', tick, [], unlisted);
        const actual = engine.stateHash(state),
          expected = game.checkpoints[tick / 30 - 1][1];
        if (actual !== expected) return mismatch('checkpoint', tick, expected, actual);
      }
      if (resumes.has(tick)) state = JSON.parse(JSON.stringify(state));
    }
    const unlisted = engine.unlistedStateFields(state);
    if (unlisted.length) return mismatch('unlistedStateFields', tick, [], unlisted);
    const actual = engine.stateHash(state);
    if (actual !== game.final.hash) return mismatch('final', tick, game.final.hash, actual);
    return null;
  } catch (error) {
    return mismatch(
      'exception',
      tick,
      'successful deterministic step',
      error instanceof Error ? error.message : String(error),
    );
  }
}
