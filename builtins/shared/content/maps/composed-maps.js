// The maps only the Composed engine plays, at revision one, in published order.
// A published definition never changes: a changed map is a new revision in the
// catalog, and a new map is added at the end.
//
// In a floor mask, # is supporting floor and . is a gap. Gaps stop fighters and
// grounded placement, never airborne attacks.
import { COLUMNS, ROWS } from '../arena.js';
import { ARENA_RULESET } from '../floor.js';
const rect = (x, y, w, h) => ({ x, y, w, h });
// A larger map passes its size in tiles.
const mask = (predicate, columns = COLUMNS, rows = ROWS) =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, col) => (predicate(col, row) ? '#' : '.')).join(''),
  );
const inBox = (x, y, l, t, r, b) => x >= l && x < r && y >= t && y < b;
// Whether the centre of tile (x, y) lies in the ellipse around the arena centre
// with the given radii in pixels.
const inEllipse = (x, y, radiusX, radiusY) => {
  const dx = (x * 40 + 20 - 480) / radiusX,
    dy = (y * 40 + 20 - 320) / radiusY;
  return dx * dx + dy * dy <= 1;
};
const common = {
  revision: 1,
  requiredRuleset: ARENA_RULESET,
  engines: ['composed'],
  supportedModes: ['timed', 'lives', 'hill'],
  floorLegend: { '#': 'supporting floor', '.': 'gap; airborne attacks may cross' },
  controllers: [],
  surfaces: [],
  walls: [],
  objects: [],
};
// The same rules where the gaps are drawn as water.
const waterCommon = {
  ...common,
  floorLegend: { '#': 'supporting floor', '.': 'water or drop; airborne attacks may cross' },
};
// A three-player equilateral triangle gives every seat the same hill distance.
const triangle = [
  [480, 110],
  [298.134665, 425],
  [661.865335, 425],
];
const centerRespawns = [
  [360, 280],
  [600, 360],
  [600, 280],
  [360, 360],
  [480, 280],
  [480, 360],
  [420, 320],
  [540, 320],
  [480, 320],
];
export const COMPOSED_MAPS = [
  {
    id: 'foundry-belts',
    name: 'Foundry Conveyors',
    theme: 'industrial',
    engines: ['composed'],
    description:
      'Arrowed belts carry fighters along the floor. Walk against them or use the side paths.',
    legend: ['Arrows: conveyor direction', 'Steel: permanent cover'],
    walls: [
      rect(240, 160, 80, 80),
      rect(640, 160, 80, 80),
      rect(240, 400, 80, 80),
      rect(640, 400, 80, 80),
    ],
    surfaces: [
      { ...rect(360, 120, 80, 160), velocityX: 0, velocityY: 1.5, walkScale: 1 },
      { ...rect(520, 360, 80, 160), velocityX: 0, velocityY: -1.5, walkScale: 1 },
    ],
  },
  {
    id: 'glasshouse',
    name: 'Glasshouse',
    theme: 'glasshouse',
    engines: ['composed'],
    description: 'Glass panels break under attacks. Stone cover remains throughout the round.',
    legend: ['Framed glass: breakable cover', 'Stone: permanent cover'],
    walls: [
      rect(240, 160, 80, 80),
      rect(640, 160, 80, 80),
      rect(240, 400, 80, 80),
      rect(640, 400, 80, 80),
    ],
    objects: [
      { id: 'glass-nw', ...rect(360, 160, 40, 80), hp: 72, material: 'glass' },
      { id: 'glass-ne', ...rect(560, 160, 40, 80), hp: 72, material: 'glass' },
      { id: 'glass-sw', ...rect(360, 400, 40, 80), hp: 72, material: 'glass' },
      { id: 'glass-se', ...rect(560, 400, 40, 80), hp: 72, material: 'glass' },
    ],
  },
  {
    ...common,
    id: 'perimeter-foundry',
    name: 'Perimeter Foundry',
    theme: 'perimeter-foundry',
    description:
      'Ride the outer conveyor to move around the arena. Cut through the work bays to intercept.',
    legend: ['Arrows: clockwise conveyor', 'Machinery: permanent cover'],
    floorMask: mask(
      (x, y) =>
        inBox(x, y, 1, 1, 23, 15) &&
        !inBox(x, y, 6, 4, 10, 6) &&
        !inBox(x, y, 6, 6, 8, 7) &&
        !inBox(x, y, 14, 10, 18, 12) &&
        !inBox(x, y, 16, 9, 18, 10),
    ),
    walls: [
      rect(240, 160, 160, 80),
      rect(240, 240, 80, 40),
      rect(560, 400, 160, 80),
      rect(640, 360, 80, 40),
    ],
    controllers: [
      {
        id: 'outer-belt',
        kind: 'perimeter',
        ...rect(40, 40, 880, 560),
        inset: 80,
        speed: 1.575,
        period: 240,
      },
    ],
    spawnSets: {
      2: [
        [140, 320],
        [820, 320],
      ],
      3: [
        [480, 100],
        [220, 480],
        [740, 480],
      ],
      4: [
        [160, 120],
        [800, 520],
        [800, 120],
        [160, 520],
      ],
    },
    respawnCandidates: [
      [160, 120],
      [800, 520],
      [800, 120],
      [160, 520],
      [140, 320],
      [820, 320],
      [480, 120],
      [480, 520],
      [360, 320],
      [600, 320],
      [480, 240],
      [480, 400],
      [480, 320],
    ],
    reviewRoutes: [
      [
        [80, 120],
        [80, 80],
        [880, 80],
        [880, 560],
        [80, 560],
        [80, 120],
      ],
      [
        [120, 320],
        [480, 320],
        [840, 320],
      ],
      [
        [480, 120],
        [480, 320],
        [480, 520],
      ],
    ],
  },
  {
    ...common,
    id: 'split-rooftops',
    name: 'Split Rooftops',
    theme: 'split-rooftops',
    description:
      'Three crossings connect the rooftops. Gaps stop fighters; airborne attacks can cross them.',
    legend: ['Dark gaps: no walking or grounded placement', 'Three bridges: upper, central, lower'],
    floorMask: mask(
      (x, y) =>
        inBox(x, y, 1, 1, 7, 15) ||
        inBox(x, y, 17, 1, 23, 15) ||
        inBox(x, y, 7, 3, 17, 5) ||
        inBox(x, y, 7, 7, 17, 10) ||
        inBox(x, y, 10, 6, 14, 10) ||
        inBox(x, y, 7, 12, 17, 14),
    ),
    walls: [
      rect(120, 200, 80, 40),
      rect(760, 200, 80, 40),
      rect(80, 400, 80, 80),
      rect(800, 400, 80, 80),
    ],
    spawnSets: {
      2: [
        [180, 320],
        [780, 320],
      ],
      3: [
        [180, 160],
        [780, 160],
        [480, 520],
      ],
      4: [
        [160, 120],
        [800, 520],
        [800, 120],
        [160, 520],
      ],
    },
    respawnCandidates: [
      [160, 120],
      [800, 520],
      [800, 120],
      [160, 520],
      [180, 320],
      [780, 320],
      [480, 160],
      [480, 520],
      [360, 320],
      [600, 320],
      [480, 280],
      [480, 360],
      [480, 320],
    ],
    reviewRoutes: [
      [
        [180, 280],
        [240, 280],
        [240, 160],
        [720, 160],
        [720, 280],
        [780, 280],
      ],
      [
        [180, 320],
        [480, 320],
        [780, 320],
      ],
      [
        [220, 440],
        [220, 520],
        [740, 520],
        [740, 440],
      ],
    ],
  },
  {
    ...common,
    id: 'ice-bowl',
    name: 'Ice Bowl',
    theme: 'ice-bowl',
    description:
      'Ice carries your momentum. Use rough ground to brake and change direction. Dash clears residual sliding.',
    legend: ['Blue floor: ice', 'Rough patches: reliable braking'],
    floorMask: mask((x, y) => inEllipse(x, y, 420, 280)),
    physics: {
      kind: 'inertia',
      acceleration: 0.32,
      friction: 0.96,
      impulseFriction: 0.88,
      gripAcceleration: 1.8,
      gripFriction: 0.35,
      gripImpulseFriction: 0.72,
      hysteresis: 5,
    },
    surfaces: [
      { id: 'center-grip', kind: 'grip', ...rect(440, 280, 80, 80) },
      { id: 'center-step', kind: 'grip', ...rect(400, 320, 40, 40) },
      { id: 'west-grip', kind: 'grip', ...rect(120, 280, 80, 80) },
      { id: 'east-grip', kind: 'grip', ...rect(760, 280, 80, 80) },
    ],
    spawnSets: {
      2: [
        [180, 320],
        [780, 320],
      ],
      3: [
        [480, 120],
        [260, 460],
        [700, 460],
      ],
      4: [
        [240, 160],
        [720, 480],
        [720, 160],
        [240, 480],
      ],
    },
    respawnCandidates: [
      [180, 320],
      [780, 320],
      [480, 120],
      [480, 520],
      [240, 200],
      [720, 440],
      [240, 440],
      [720, 200],
      [360, 320],
      [600, 320],
      [480, 240],
      [480, 400],
      [480, 320],
    ],
    reviewRoutes: [
      [
        [180, 320],
        [280, 160],
        [480, 120],
        [680, 160],
        [780, 320],
      ],
      [
        [180, 320],
        [480, 320],
        [780, 320],
      ],
      [
        [240, 440],
        [480, 520],
        [720, 440],
      ],
    ],
  },
  {
    ...common,
    id: 'winding-canyon',
    name: 'Winding Canyon',
    theme: 'winding-canyon',
    description: 'Fight through winding chambers. Break cracked rock to open a shorter route.',
    legend: ['Cracked rock: breakable shortcut', 'Dark ravine: no supporting floor'],
    floorMask: mask(
      (x, y) =>
        inBox(x, y, 2, 2, 12, 8) ||
        inBox(x, y, 7, 5, 17, 11) ||
        inBox(x, y, 12, 8, 22, 14) ||
        inBox(x, y, 13, 3, 20, 7) ||
        inBox(x, y, 4, 9, 11, 13),
    ),
    walls: [rect(280, 160, 80, 80), rect(600, 400, 80, 80)],
    objects: [
      { id: 'north-shortcut', ...rect(360, 160, 80, 80), hp: 160, material: 'rock' },
      { id: 'south-shortcut', ...rect(520, 400, 80, 80), hp: 160, material: 'rock' },
    ],
    spawnSets: {
      2: [
        [160, 160],
        [800, 480],
      ],
      3: [
        [240, 200],
        [720, 200],
        [720, 440],
      ],
      4: [
        [240, 200],
        [720, 440],
        [720, 200],
        [240, 440],
      ],
    },
    respawnCandidates: [
      [160, 160],
      [800, 480],
      [720, 200],
      [240, 440],
      [180, 280],
      [780, 360],
      [480, 240],
      [480, 400],
      [360, 320],
      [600, 320],
      [480, 320],
    ],
    reviewRoutes: [
      [
        [160, 160],
        [160, 280],
        [480, 280],
        [480, 360],
        [800, 360],
        [800, 480],
      ],
      [
        [160, 120],
        [460, 120],
        [460, 280],
        [720, 240],
      ],
      [
        [240, 460],
        [500, 460],
        [500, 520],
        [800, 520],
      ],
    ],
  },
  {
    ...common,
    id: 'turntable',
    name: 'Turntable',
    theme: 'turntable',
    description:
      'The central floor carries fighters clockwise. The four outer wings provide stable footing.',
    legend: ['Brass disk: rotating floor', 'Outer wings: stable ground'],
    floorMask: mask(
      (x, y) => inEllipse(x, y, 240, 240) || inBox(x, y, 9, 1, 15, 15) || inBox(x, y, 1, 5, 23, 11),
    ),
    controllers: [
      {
        id: 'center-bearing',
        kind: 'rotation',
        x: 480,
        y: 320,
        radius: 220,
        speed: 1.575,
        period: 880,
      },
    ],
    walls: [
      rect(120, 240, 80, 40),
      rect(760, 360, 80, 40),
      rect(520, 80, 40, 80),
      rect(400, 480, 40, 80),
    ],
    spawnSets: {
      2: [
        [160, 320],
        [800, 320],
      ],
      3: [
        [480, 100],
        [220, 400],
        [740, 400],
      ],
      4: [
        [240, 320],
        [720, 320],
        [480, 100],
        [480, 540],
      ],
    },
    respawnCandidates: [
      [160, 320],
      [800, 320],
      [480, 100],
      [480, 540],
      [280, 320],
      [680, 320],
      [480, 180],
      [480, 460],
      [360, 320],
      [600, 320],
      [480, 320],
    ],
    reviewRoutes: [
      [
        [160, 320],
        [480, 320],
        [800, 320],
      ],
      [
        [480, 100],
        [480, 320],
        [480, 540],
      ],
      [
        [280, 320],
        [340, 180],
        [620, 180],
        [680, 320],
        [620, 460],
        [340, 460],
        [280, 320],
      ],
    ],
  },
  {
    ...common,
    id: 'overgrown-garden',
    name: 'Overgrown Garden',
    theme: 'overgrown-garden',
    description:
      'Breaking hedges joins the clearings and opens longer sightlines. Trees and stone remain.',
    legend: ['Outlined hedges: breakable cover', 'Trees and stone: permanent cover'],
    floorMask: mask(
      (x, y) =>
        inBox(x, y, 2, 4, 22, 12) ||
        inBox(x, y, 4, 2, 12, 6) ||
        inBox(x, y, 12, 1, 19, 6) ||
        inBox(x, y, 5, 10, 12, 15) ||
        inBox(x, y, 13, 10, 20, 14),
    ),
    walls: [
      rect(240, 160, 40, 80),
      rect(680, 400, 40, 80),
      rect(720, 120, 40, 40),
      rect(200, 480, 40, 40),
    ],
    objects: [
      { id: 'hedge-west-curve-a', ...rect(280, 200, 80, 40), hp: 96, material: 'hedge' },
      { id: 'hedge-west-curve-b', ...rect(320, 240, 40, 80), hp: 96, material: 'hedge' },
      { id: 'hedge-west-curve-c', ...rect(240, 400, 120, 40), hp: 120, material: 'hedge' },
      { id: 'hedge-north-a', ...rect(400, 120, 80, 40), hp: 96, material: 'hedge' },
      { id: 'hedge-north-b', ...rect(480, 160, 80, 40), hp: 96, material: 'hedge' },
      { id: 'hedge-east-curve-a', ...rect(600, 200, 120, 40), hp: 120, material: 'hedge' },
      { id: 'hedge-east-curve-b', ...rect(600, 320, 40, 80), hp: 96, material: 'hedge' },
      { id: 'hedge-east-curve-c', ...rect(600, 400, 80, 40), hp: 96, material: 'hedge' },
      { id: 'hedge-south-a', ...rect(400, 440, 80, 40), hp: 96, material: 'hedge' },
    ],
    spawnSets: {
      2: [
        [160, 280],
        [800, 360],
      ],
      3: [
        [560, 100],
        [200, 400],
        [760, 440],
      ],
      4: [
        [160, 280],
        [800, 360],
        [640, 100],
        [320, 540],
      ],
    },
    respawnCandidates: [
      [160, 280],
      [800, 360],
      [640, 100],
      [320, 540],
      [400, 200],
      [560, 440],
      [480, 240],
      [480, 400],
      [400, 320],
      [560, 320],
      [480, 320],
    ],
    reviewRoutes: [
      [
        [160, 280],
        [200, 280],
        [200, 400],
        [480, 400],
        [480, 320],
        [560, 320],
        [560, 240],
        [800, 240],
        [800, 360],
      ],
      [
        [640, 100],
        [640, 240],
        [480, 240],
        [480, 320],
      ],
      [
        [320, 540],
        [360, 540],
        [360, 400],
        [480, 400],
      ],
    ],
  },
  {
    ...waterCommon,
    id: 'breakwater',
    name: 'Breakwater',
    theme: 'breakwater',
    description:
      'A broad central causeway and two outer crossings connect the docks. Shots cross the water; fighters use the bridges.',
    legend: ['Blue water: no walking', 'Stone piers: permanent cover', 'Three crossings'],
    floorMask: mask(
      (x, y) =>
        inBox(x, y, 1, 5, 23, 11) ||
        inBox(x, y, 1, 2, 9, 14) ||
        inBox(x, y, 15, 2, 23, 14) ||
        inBox(x, y, 5, 2, 19, 3) ||
        inBox(x, y, 5, 13, 19, 14) ||
        inBox(x, y, 11, 2, 13, 14),
    ),
    walls: [
      rect(200, 280, 40, 80),
      rect(720, 280, 40, 80),
      rect(200, 120, 80, 40),
      rect(680, 120, 80, 40),
      rect(200, 480, 80, 40),
      rect(680, 480, 80, 40),
    ],
    spawnSets: {
      2: [
        [120, 320],
        [840, 320],
      ],
      3: triangle,
      4: [
        [120, 160],
        [840, 480],
        [840, 160],
        [120, 480],
      ],
    },
    respawnCandidates: [
      [120, 160],
      [840, 480],
      [840, 160],
      [120, 480],
      [480, 100],
      [480, 540],
      [280, 320],
      [680, 320],
      ...centerRespawns,
    ],
    reviewRoutes: [
      [
        [120, 320],
        [160, 240],
        [280, 240],
        [360, 320],
        [600, 320],
        [680, 240],
        [800, 240],
        [840, 320],
      ],
      [
        [120, 160],
        [280, 100],
        [480, 100],
        [680, 100],
        [840, 160],
      ],
      [
        [120, 480],
        [280, 540],
        [480, 540],
        [680, 540],
        [840, 480],
      ],
    ],
  },
  {
    ...waterCommon,
    id: 'sunken-court',
    name: 'Sunken Court',
    theme: 'sunken-court',
    description:
      'A clear central court with four covered approaches. Wooden shutters break to open shorter routes between the corners.',
    legend: ['Stone: permanent cover', 'Striped wood: breakable shutters', 'Open central court'],
    floorMask: mask((x, y) => inBox(x, y, 3, 1, 21, 15) || inBox(x, y, 1, 3, 23, 13)),
    walls: [
      rect(240, 160, 80, 40),
      rect(640, 160, 80, 40),
      rect(240, 440, 80, 40),
      rect(640, 440, 80, 40),
    ],
    objects: [
      { id: 'shutter-nw', ...rect(320, 160, 40, 80), hp: 96, material: 'wood' },
      { id: 'shutter-ne', ...rect(600, 160, 40, 80), hp: 96, material: 'wood' },
      { id: 'shutter-sw', ...rect(320, 400, 40, 80), hp: 96, material: 'wood' },
      { id: 'shutter-se', ...rect(600, 400, 40, 80), hp: 96, material: 'wood' },
    ],
    spawnSets: {
      2: [
        [160, 320],
        [800, 320],
      ],
      3: [
        [690, 320],
        [375, 501.865335],
        [375, 138.134665],
      ],
      4: [
        [180, 120],
        [780, 520],
        [780, 120],
        [180, 520],
      ],
    },
    respawnCandidates: [
      [180, 120],
      [780, 520],
      [780, 120],
      [180, 520],
      [480, 100],
      [480, 540],
      [240, 320],
      [720, 320],
      ...centerRespawns,
    ],
    reviewRoutes: [
      [
        [160, 320],
        [360, 320],
        [600, 320],
        [800, 320],
      ],
      [
        [180, 120],
        [400, 120],
        [480, 240],
        [560, 120],
        [780, 120],
      ],
      [
        [180, 520],
        [400, 520],
        [480, 400],
        [560, 520],
        [780, 520],
      ],
    ],
  },
];
// Maps on a larger arena, added after the revision-two spawns. The catalog lists
// them after every earlier revision, so earlier positions never move. Each is
// symmetric about both centre lines.
export const LARGER_MAPS = [
  {
    ...waterCommon,
    id: 'harbour-yard',
    name: 'Harbour Yard',
    theme: 'harbour-yard',
    width: 1200,
    height: 800,
    description:
      'A wide quay with four flooded docks. Crates break to open the flanks around the central cover.',
    legend: ['Stone: permanent cover', 'Striped wood: breakable crates', 'Flooded docks'],
    floorMask: mask(
      (x, y) =>
        inBox(x, y, 1, 1, 29, 19) &&
        !inBox(x, y, 6, 2, 10, 6) &&
        !inBox(x, y, 20, 2, 24, 6) &&
        !inBox(x, y, 6, 14, 10, 18) &&
        !inBox(x, y, 20, 14, 24, 18),
      30,
      20,
    ),
    walls: [
      rect(440, 220, 80, 40),
      rect(680, 220, 80, 40),
      rect(380, 360, 40, 80),
      rect(780, 360, 40, 80),
      rect(440, 540, 80, 40),
      rect(680, 540, 80, 40),
    ],
    objects: [
      { id: 'crate-nw', ...rect(280, 280, 40, 80), hp: 96, material: 'wood' },
      { id: 'crate-ne', ...rect(880, 280, 40, 80), hp: 96, material: 'wood' },
      { id: 'crate-sw', ...rect(280, 440, 40, 80), hp: 96, material: 'wood' },
      { id: 'crate-se', ...rect(880, 440, 40, 80), hp: 96, material: 'wood' },
    ],
    spawnSets: {
      2: [
        [120, 400],
        [1080, 400],
      ],
      3: [
        [600, 120],
        [357.512887, 540],
        [842.487113, 540],
      ],
      4: [
        [160, 160],
        [1040, 640],
        [1040, 160],
        [160, 640],
      ],
    },
    respawnCandidates: [
      [160, 160],
      [1040, 640],
      [1040, 160],
      [160, 640],
      [600, 120],
      [600, 680],
      [240, 400],
      [960, 400],
      [520, 360],
      [680, 440],
      [680, 360],
      [520, 440],
      [600, 320],
      [600, 480],
      [600, 400],
    ],
    reviewRoutes: [
      [
        [120, 400],
        [200, 280],
        [360, 200],
        [600, 140],
        [840, 200],
        [1000, 280],
        [1080, 400],
      ],
      [
        [160, 640],
        [360, 600],
        [600, 480],
        [840, 600],
        [1040, 640],
      ],
    ],
  },
  {
    ...waterCommon,
    id: 'grand-causeway',
    name: 'Grand Causeway',
    theme: 'grand-causeway',
    width: 1440,
    height: 960,
    description:
      'Three islands joined by causeways. Wooden gates close the outer crossings until they are broken.',
    legend: [
      'Stone: permanent cover',
      'Striped wood: breakable gates',
      'Water between the islands',
    ],
    floorMask: mask(
      (x, y) =>
        inBox(x, y, 1, 1, 35, 23) &&
        !(
          (inBox(x, y, 11, 1, 13, 23) || inBox(x, y, 23, 1, 25, 23)) &&
          !inBox(x, y, 0, 3, 36, 6) &&
          !inBox(x, y, 0, 10, 36, 14) &&
          !inBox(x, y, 0, 18, 36, 21)
        ),
      36,
      24,
    ),
    walls: [
      rect(600, 320, 80, 40),
      rect(760, 320, 80, 40),
      rect(600, 600, 80, 40),
      rect(760, 600, 80, 40),
      rect(200, 440, 80, 80),
      rect(1160, 440, 80, 80),
    ],
    objects: [
      { id: 'gate-nw', ...rect(460, 120, 40, 120), hp: 96, material: 'wood' },
      { id: 'gate-ne', ...rect(940, 120, 40, 120), hp: 96, material: 'wood' },
      { id: 'gate-sw', ...rect(460, 720, 40, 120), hp: 96, material: 'wood' },
      { id: 'gate-se', ...rect(940, 720, 40, 120), hp: 96, material: 'wood' },
    ],
    spawnSets: {
      2: [
        [120, 480],
        [1320, 480],
      ],
      3: [
        [720, 280],
        [546.794919, 580],
        [893.205081, 580],
      ],
      4: [
        [160, 160],
        [1280, 800],
        [1280, 160],
        [160, 800],
      ],
    },
    respawnCandidates: [
      [160, 160],
      [1280, 800],
      [1280, 160],
      [160, 800],
      [720, 120],
      [720, 840],
      [120, 480],
      [1320, 480],
      [640, 440],
      [800, 520],
      [800, 440],
      [640, 520],
      [720, 400],
      [720, 560],
      [720, 480],
    ],
    reviewRoutes: [
      [
        [120, 480],
        [160, 180],
        [480, 180],
        [720, 240],
        [960, 180],
        [1280, 180],
        [1320, 480],
      ],
      [
        [160, 800],
        [480, 780],
        [720, 720],
        [960, 780],
        [1280, 800],
      ],
    ],
  },
];

// CTF is published as new revisions; earlier recordings keep their original maps.
const ctfLayouts = {
  'harbour-yard': {
    2: [
      { x: 120, y: 400 },
      { x: 1080, y: 400 },
    ],
    3: [
      { x: 600, y: 120 },
      { x: 160, y: 640 },
      { x: 1040, y: 640 },
    ],
    4: [
      { x: 160, y: 160 },
      { x: 1040, y: 640 },
      { x: 1040, y: 160 },
      { x: 160, y: 640 },
    ],
  },
  'grand-causeway': {
    2: [
      { x: 120, y: 480 },
      { x: 1320, y: 480 },
    ],
    3: [
      { x: 720, y: 160 },
      { x: 160, y: 800 },
      { x: 1280, y: 800 },
    ],
    4: [
      { x: 160, y: 160 },
      { x: 1280, y: 800 },
      { x: 1280, y: 160 },
      { x: 160, y: 800 },
    ],
  },
};
export const CTF_MAPS = LARGER_MAPS.map((map) => ({
  ...map,
  revision: 2,
  supportedModes: [...map.supportedModes, 'ctf'],
  ctfBases: ctfLayouts[map.id],
}));
