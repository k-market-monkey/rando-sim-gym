// Presets use exact published library names and belong to one engine.
export const LOADOUT_PRESETS = [
  {
    id: 'beginner',
    mechanicsVersion: 'composed',
    label: 'Beginner',
    names: ['machine gun', 'rocketlauncher', 'flamethrower'],
  },
];

export function applyLoadoutPreset(preset, current, count) {
  const next = Array.from({ length: 5 }, (_, slot) => current[slot] || '');
  for (let slot = 0; slot < Math.min(count, preset.names.length); slot++)
    next[slot] = preset.names[slot];
  // Preserve additional slots unless they now repeat a recommended move. Hidden
  // saved slots are left intact when the room currently uses fewer than five.
  const seen = new Set();
  for (let slot = 0; slot < count; slot++) {
    if (next[slot] && seen.has(next[slot])) next[slot] = '';
    if (next[slot]) seen.add(next[slot]);
  }
  return next;
}
