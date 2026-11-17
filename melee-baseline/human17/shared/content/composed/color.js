// Hue arithmetic for a move's core color. The color also sets friendly and self
// damage (shared/sim/teams.js), so calibration may turn an unlocked color a
// little: the brightest and dimmest channels stay, only the hue moves.

/** Largest hue change, in degrees, that tuning may make from the original color. */
export const MAX_HUE_SHIFT = 30;

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The hue of a #rrggbb color in degrees [0, 360), or null for a gray. */
export function hueOf(hex) {
  const [r, g, b] = channels(hex),
    max = Math.max(r, g, b),
    chroma = max - Math.min(r, g, b);
  if (!chroma) return null;
  const hue =
    max === r
      ? (60 * (g - b)) / chroma
      : max === g
        ? 120 + (60 * (b - r)) / chroma
        : 240 + (60 * (r - g)) / chroma;
  return (hue + 360) % 360;
}

/** The signed shortest turn from hue `a` to hue `b`, in (-180, 180]. */
export function hueTurn(a, b) {
  const turn = (((b - a) % 360) + 360) % 360;
  return turn > 180 ? turn - 360 : turn;
}

/** The same color turned to `hue` degrees, keeping its brightest and dimmest channels. */
export function withHue(hex, hue) {
  const [r, g, b] = channels(hex),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    h = ((hue % 360) + 360) % 360,
    sector = Math.floor(h / 60),
    rise = Math.round(min + ((max - min) * (h - sector * 60)) / 60),
    fall = max + min - rise,
    rgb = [
      [max, rise, min],
      [fall, max, min],
      [min, max, rise],
      [min, fall, max],
      [rise, min, max],
      [max, min, fall],
    ][sector];
  if (max === min) return hex.toLowerCase();
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
