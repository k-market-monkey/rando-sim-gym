/** Shared health rules. Handicap is a fraction of the room's health setting. */
function percentage(value, min, max, fallback) {
  const usable =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof fallback === 'number' && Number.isFinite(fallback)
        ? fallback
        : 100;
  return Math.max(min, Math.min(max, Math.round(usable)));
}
export const normalizeHealthPercent = (value, fallback = 100) =>
  percentage(value, 10, 500, fallback);
export const normalizeHandicapPercent = (value, fallback = 100) =>
  percentage(value, 10, 100, fallback);
export function maxHealth(healthPercent = 100, handicapPercent = 100) {
  return Math.max(
    1,
    Math.round(
      (normalizeHealthPercent(healthPercent) * normalizeHandicapPercent(handicapPercent)) / 100,
    ),
  );
}
