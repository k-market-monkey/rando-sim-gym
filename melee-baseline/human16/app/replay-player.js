import { decodeReplayInputs, MAX_REPLAY_TICKS } from '../shared/protocol/replay-inputs.js';
import { validateRecordedGame } from '../shared/sim/conformance.js';

export const REPLAY_TICK_RATE = 30;
export const REPLAY_SPEEDS = Object.freeze([0.5, 1, 2, 4]);
const KEYFRAME_TICKS = 300;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safePath = (value) =>
  typeof value === 'string' && value.split('/').every((part) => /^[a-zA-Z0-9_-]+$/.test(part));

/** Use only the manifest's exact leaf; never fall back to the current dispatcher. */
export function replayEnginePath(manifest, build) {
  if (
    typeof build !== 'string' ||
    !/^[a-z]+-b[1-9][0-9]*$/.test(build) ||
    manifest?.format !== 1 ||
    !object(manifest.builds) ||
    !Object.hasOwn(manifest.builds, build)
  )
    throw new Error('This replay needs a version of the game that is no longer available.');
  const entry = manifest.builds[build];
  if (
    !object(entry) ||
    typeof entry.engine !== 'string' ||
    !/^[a-z]+$/.test(entry.engine) ||
    !build.startsWith(`${entry.engine}-b`) ||
    entry.entry !== `shared/sim/${entry.engine}/engine.js` ||
    (entry.root !== '.' &&
      (!safePath(entry.root) ||
        (entry.root !== `shared/sim-builds/${build}` &&
          !entry.root.startsWith(`shared/sim-builds/${build}/`))))
  )
    throw new Error('This replay has an unsafe engine build mapping and cannot be opened.');
  return `/${entry.root === '.' ? '' : `${entry.root}/`}${entry.entry}`;
}

/** Stateful playback with independent input and snapshot copies for repeatable seeking. */
export function createReplayPlayer(
  engine,
  game,
  { onMismatch = () => {}, onStep = () => {} } = {},
) {
  const invalid = validateRecordedGame(game);
  if (invalid || game.final.tick > MAX_REPLAY_TICKS)
    throw new Error('This replay is incomplete or has an unsupported recording format.');
  for (const method of ['createMatch', 'step', 'stateHash'])
    if (typeof engine?.[method] !== 'function')
      throw new Error('The replay engine is unavailable.');
  const inputs = decodeReplayInputs(
      game.inputs,
      game.header.players.map((player) => player.id),
    ),
    total = game.final.tick,
    checkpoints = new Map(game.checkpoints),
    keyframes = new Map();
  let state = engine.createMatch(structuredClone(game.header)),
    tick = 0,
    playing = false,
    speed = 1,
    accumulated = 0,
    firstMismatch = null;
  if (state.engineBuild !== game.engineBuild)
    throw new Error('This replay needs a version of the game that is no longer available.');
  keyframes.set(0, structuredClone(state));

  function mismatch(kind, expected, actual) {
    if (firstMismatch) return;
    firstMismatch = { kind, tick, expected, actual };
    onMismatch({ ...firstMismatch });
  }
  function check() {
    if (state.tick !== tick) mismatch('tick', tick, state.tick);
    if (checkpoints.has(tick) || tick === total) {
      const actual = engine.stateHash(state);
      if (checkpoints.has(tick) && actual !== checkpoints.get(tick))
        mismatch('checkpoint', checkpoints.get(tick), actual);
      if (tick === total && actual !== game.final.hash) mismatch('final', game.final.hash, actual);
    }
  }
  function step(audible) {
    // The audio layer needs the previous end flag; retaining mutable engine state
    // would lose it after step and cloning the entire match every tick is wasteful.
    const previous = { tick: state.tick, ended: state.ended, roundNumber: state.roundNumber };
    engine.step(state, structuredClone(inputs[tick]));
    tick++;
    check();
    if (tick % KEYFRAME_TICKS === 0 && !keyframes.has(tick))
      keyframes.set(tick, structuredClone(state));
    if (audible) onStep(state, previous);
    if (tick === total) {
      playing = false;
      accumulated = 0;
    }
  }
  check();
  return {
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    get total() {
      return total;
    },
    get hash() {
      return engine.stateHash(state);
    },
    get playing() {
      return playing;
    },
    get speed() {
      return speed;
    },
    get mismatch() {
      return firstMismatch && { ...firstMismatch };
    },
    play() {
      playing = tick < total;
    },
    pause() {
      playing = false;
      accumulated = 0;
    },
    setSpeed(value) {
      if (!REPLAY_SPEEDS.includes(value)) throw new RangeError('Unsupported replay speed');
      speed = value;
    },
    advance(elapsedMs) {
      if (!playing || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
      // A background tab must not replay minutes of audio on its next frame.
      accumulated += (Math.min(elapsedMs, 250) * speed * REPLAY_TICK_RATE) / 1000;
      while (playing && accumulated >= 1 - 1e-9) {
        accumulated = Math.max(0, accumulated - 1);
        step(true);
      }
    },
    seek(target) {
      if (!Number.isFinite(target)) return;
      target = Math.max(0, Math.min(total, Math.round(target)));
      accumulated = 0;
      let start = 0;
      for (const saved of keyframes.keys()) if (saved <= target && saved > start) start = saved;
      if (tick > target || start > tick) {
        state = structuredClone(keyframes.get(start));
        tick = start;
      }
      while (tick < target) step(false);
      check();
      if (tick === total) playing = false;
    },
  };
}

export function replayTime(seconds) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
