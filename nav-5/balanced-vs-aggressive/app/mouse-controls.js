export const MOUSE_BUTTON_CODES = Object.freeze(
  Array.from({ length: 32 }, (_, button) => `Mouse${button}`),
);
export function mouseButtonCode(button) {
  return Number.isInteger(button) && button >= 0 && button < 32 ? MOUSE_BUTTON_CODES[button] : '';
}
export function mouseButtonLabel(button) {
  return mouseButtonCode(button)
    ? ['CLICK', 'MIDDLE', 'RIGHT'][button] || `MOUSE${button + 1}`
    : 'NONE';
}
export function bindingHeld(code, keys, buttons) {
  if (!code) return false;
  if (/^Mouse(?:[0-9]|[12][0-9]|3[01])$/.test(code)) return buttons.has(Number(code.slice(5)));
  return keys.has(code);
}
