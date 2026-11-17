// Arithmetic whose result is the same bits in every browser, in Node and in any
// future port of the simulation.
//
// IEEE 754 defines addition, multiplication and square root exactly. The language
// leaves `Math.hypot`, `**` and the other functions banned by the lint rule to
// each implementation, so two machines may disagree in the last bit, and a match
// replayed on the second machine drifts away from the first.
//
// A port to a compiled language must also turn off fused multiply-add here.

/** The length of the vector (x, y). */
export const hypot = (x, y) => Math.sqrt(x * x + y * y);

/** `value` multiplied by itself. */
export const square = (value) => value * value;
