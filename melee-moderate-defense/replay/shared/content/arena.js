// The arena every map is drawn on, in simulation units. Maps are authored in
// absolute coordinates on this grid, so these numbers are part of every map and
// every replay: they are named here, not meant to be changed. A map may name a
// larger size, up to MAX_WIDTH by MAX_HEIGHT; a map without one uses the default.
export const WIDTH = 960,
  HEIGHT = 640,
  MAX_WIDTH = 1440,
  MAX_HEIGHT = 960,
  // Side of one floor tile; the default arena is COLUMNS by ROWS tiles.
  TILE = 40,
  COLUMNS = WIDTH / TILE,
  ROWS = HEIGHT / TILE,
  // Thickness of the border wall no fighter or object may enter.
  BORDER = 20;
/** The middle of the default arena, where the hill is. */
export const CENTER = Object.freeze({ x: WIDTH / 2, y: HEIGHT / 2 });
/** The arena a round names; a round on the default arena names none. */
export const stateArena = (state) => ({
  width: state?.arenaWidth ?? WIDTH,
  height: state?.arenaHeight ?? HEIGHT,
});
/** The middle of a map's or a round's arena. */
export const arenaCenter = (map) =>
  map.width === WIDTH && map.height === HEIGHT ? CENTER : { x: map.width / 2, y: map.height / 2 };
