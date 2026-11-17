// Approved library name corrections. Keep saved picks, favorites and shared
// loadouts usable without changing historical match/replay definitions.
export function currentMoveName(name, mechanicsVersion) {
  return mechanicsVersion === 'composed' && name === 'life round her' ? 'liferoundhere' : name;
}
