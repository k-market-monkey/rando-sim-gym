// The wall-clock budget of one calibration run. This is the only shared code that
// reads the clock. A deadline can stop a run with an error; it never changes the
// result of a run that finishes.

/** The time `milliseconds` from now, as milliseconds since the epoch. */
export const deadlineIn = (milliseconds) => Date.now() + milliseconds;

/** Throws once `deadline` has passed. A deadline of `Infinity` never passes. */
export function checkDeadline(deadline) {
  if (Date.now() > deadline) throw Error('Composed calibration exceeded its CPU deadline');
}
