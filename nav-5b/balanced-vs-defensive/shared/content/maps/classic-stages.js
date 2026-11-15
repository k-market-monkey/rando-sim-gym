// The Classic stages, authored in tiles: walls block movement and shots, hazards
// cycle on and off, pads speed fighters up.
import { COLUMNS, ROWS, TILE } from '../arena.js';
function inside(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function stage(id, name, description, wallTiles, hazardTiles = [], padTiles = []) {
  const rects = (t) =>
    t.map(([x, y, w, h]) => ({ x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE }));
  const walls = rects(wallTiles),
    hazards = rects(hazardTiles),
    pads = rects(padTiles);
  const tiles = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLUMNS }, (_, x) =>
      walls.some((r) => inside(x * TILE + TILE / 2, y * TILE + TILE / 2, r))
        ? '#'
        : hazards.some((r) => inside(x * TILE + TILE / 2, y * TILE + TILE / 2, r))
          ? '!'
          : pads.some((r) => inside(x * TILE + TILE / 2, y * TILE + TILE / 2, r))
            ? '>'
            : '.',
    ).join(''),
  );
  return { id, name, description, tiles, walls, hazards, pads };
}
/** The three stages Classic matches are played on, in their published order. */
export const CLASSIC_STAGES = [
  stage('foundry', 'The Foundry', 'Four solid pillars with open sightlines.', [
    [6, 4, 2, 2],
    [16, 4, 2, 2],
    [6, 10, 2, 2],
    [16, 10, 2, 2],
  ]),
  stage(
    'garden',
    'Neon Garden',
    'Mint pads increase movement speed. Hedges block movement and shots.',
    [
      [5, 3, 2, 4],
      [17, 9, 2, 4],
      [11, 3, 2, 2],
      [11, 11, 2, 2],
    ],
    [],
    [
      [3, 10, 2, 2],
      [19, 4, 2, 2],
    ],
  ),
  stage(
    'reactor',
    'The Reactor',
    'Red tiles cycle on and off, dealing damage while lit. Mint pads increase movement speed.',
    [
      [6, 3, 2, 3],
      [16, 10, 2, 3],
    ],
    [
      [10, 4, 4, 2],
      [10, 10, 4, 2],
    ],
    [
      [3, 10, 2, 2],
      [19, 4, 2, 2],
    ],
  ),
];
