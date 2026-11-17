// Which canvas sides of each map are drawn as walls. Rays and free shots reflect
// off or stop at a wall side; an open side is empty space they fly out through.
// Kept beside the published definitions so those stay byte-identical; every
// revision of a map shares its sides, and every map must be listed here.
//
// Maps without a floor mask draw the canvas border as the arena wall (the inset
// frame in the plain stage drawing), so all four sides are walls. Floor-mask maps
// draw only their floor, cover and the void around it; no floor tile reaches the
// border, so every side is open.
export const BORDER_SIDES = Object.freeze(['top', 'right', 'bottom', 'left']);
const WALLED = BORDER_SIDES,
  OPEN = Object.freeze([]);
export const MAP_BORDER_WALLS = Object.freeze({
  foundry: WALLED,
  garden: WALLED,
  reactor: WALLED,
  'foundry-belts': WALLED,
  glasshouse: WALLED,
  'balance-foundry': WALLED,
  'perimeter-foundry': OPEN,
  'split-rooftops': OPEN,
  'ice-bowl': OPEN,
  'winding-canyon': OPEN,
  turntable: OPEN,
  'overgrown-garden': OPEN,
  breakwater: OPEN,
  'sunken-court': OPEN,
  'harbour-yard': OPEN,
  'grand-causeway': OPEN,
});
/** The wall sides of a map; an unlisted map keeps the original four walls. */
export const mapBorderWalls = (map) => MAP_BORDER_WALLS[map.id] ?? WALLED;
