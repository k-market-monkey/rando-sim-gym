export const MAX_REPLAY_TICKS = 18030;
export const MAX_REPLAY_SEATS = 16;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validSeats = (seats) =>
  Array.isArray(seats) &&
  seats.length > 0 &&
  seats.length <= MAX_REPLAY_SEATS &&
  seats.every((seat) => typeof seat === 'string' && seat.length > 0) &&
  new Set(seats).size === seats.length;

function inputText(input) {
  return JSON.stringify(input, (_, value) => {
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new TypeError('Replay inputs must contain JSON values');
    return value;
  });
}

/** Count inputs without expanding runs; null means malformed or beyond the compact format's limits.
 * Legacy arrays retain the original recorded-game validation rules.
 */
export function replayInputCount(inputs, seats = undefined) {
  if (Array.isArray(inputs)) return inputs.every(object) ? inputs.length : null;
  if (
    !object(inputs) ||
    inputs.encoding !== 2 ||
    !validSeats(inputs.seats) ||
    (seats !== undefined &&
      (!validSeats(seats) ||
        seats.length !== inputs.seats.length ||
        seats.some((seat, i) => seat !== inputs.seats[i]))) ||
    !Number.isSafeInteger(inputs.ticks) ||
    inputs.ticks < 0 ||
    inputs.ticks > MAX_REPLAY_TICKS ||
    !Array.isArray(inputs.runs) ||
    inputs.runs.length !== inputs.seats.length
  )
    return null;
  for (const runs of inputs.runs) {
    if (!Array.isArray(runs) || runs.length > inputs.ticks) return null;
    let count = 0;
    for (const run of runs) {
      if (
        !Array.isArray(run) ||
        run.length !== 2 ||
        !Number.isSafeInteger(run[0]) ||
        run[0] <= 0 ||
        !object(run[1])
      )
        return null;
      count += run[0];
      if (count > inputs.ticks) return null;
    }
    if (count !== inputs.ticks) return null;
  }
  return inputs.ticks;
}

/** Preserve complete input objects, including one-shot commands and slot arrays. */
export function encodeReplayInputs(inputs, seats) {
  if (
    !validSeats(seats) ||
    !Array.isArray(inputs) ||
    inputs.length > MAX_REPLAY_TICKS ||
    inputs.some(
      (input) =>
        !object(input) ||
        Object.keys(input).length !== seats.length ||
        seats.some((seat) => !Object.hasOwn(input, seat) || !object(input[seat])),
    )
  )
    throw new TypeError('Invalid replay inputs or seats');
  const runs = seats.map((seat) => {
    const result = [];
    let previous;
    for (const input of inputs) {
      const value = input[seat],
        text = inputText(value);
      if (text === previous) result[result.length - 1][0]++;
      else result.push([1, structuredClone(value)]);
      previous = text;
    }
    return result;
  });
  return { encoding: 2, seats: [...seats], ticks: inputs.length, runs };
}

/** Every tick owns its controls; mutating one decoded tick cannot alter another. */
export function decodeReplayInputs(inputs, seats = undefined) {
  const ticks = replayInputCount(inputs, seats);
  if (ticks === null) throw new TypeError('Invalid replay inputs');
  if (Array.isArray(inputs)) return inputs.map((input) => structuredClone(input));
  const result = Array.from({ length: ticks }, () => ({}));
  inputs.seats.forEach((seat, i) => {
    let tick = 0;
    for (const [count, input] of inputs.runs[i])
      for (let n = 0; n < count; n++) {
        // defineProperty also handles legacy seat names such as __proto__ safely.
        Object.defineProperty(result[tick++], seat, {
          value: structuredClone(input),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
  });
  return result;
}
