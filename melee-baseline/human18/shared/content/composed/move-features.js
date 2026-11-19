// The optional Composed mechanics a room can turn off. The engine always supports
// every feature; a room that disables one keeps moves that need it out of its
// loadouts. Which features a move needs is read from its definition.
export const COMPOSED_FEATURES = Object.freeze([
  Object.freeze({ id: 'teleport', label: 'Teleport' }),
  Object.freeze({ id: 'homing', label: 'Homing' }),
  Object.freeze({ id: 'reflected-ray', label: 'Reflected rays' }),
  Object.freeze({ id: 'companion', label: 'Companions' }),
  Object.freeze({ id: 'decoy', label: 'Decoys' }),
]);
const IDS = COMPOSED_FEATURES.map((feature) => feature.id);

/** The features a move needs, in list order. A Classic move needs none. */
export function moveFeatures(move) {
  const templates = Array.isArray(move?.templates) ? move.templates : [];
  const needs = {
    teleport: move?.casterAction?.kind === 'teleport',
    homing: templates.some((template) => template.guidance?.kind === 'homing'),
    'reflected-ray': templates.some((template) => template.ray?.kind === 'reflect'),
    companion: templates.some((template) => template.actor?.kind === 'companion'),
    decoy: templates.some((template) => template.actor?.kind === 'decoy'),
  };
  return IDS.filter((id) => needs[id]);
}

/** A list of disabled features as stored in room settings: known IDs, once each, in list order. */
export function normalizeDisabledFeatures(value) {
  return Array.isArray(value) ? IDS.filter((id) => value.includes(id)) : [];
}

/** Whether a room that disables these features may use the move. */
export function moveAllowed(move, disabledFeatures) {
  if (!disabledFeatures?.length) return true;
  return !moveFeatures(move).some((id) => disabledFeatures.includes(id));
}
