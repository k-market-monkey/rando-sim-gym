// The map catalog: every published revision of every map, and which engine can
// play it. A match pins a map by ID and revision, so a published revision is
// never edited; a changed map is published as a new revision.
import { DEFAULT_MECHANICS_VERSION, getMechanicsVersion } from '../../protocol/versions.js';
import { WIDTH, HEIGHT, MAX_WIDTH, MAX_HEIGHT, TILE, BORDER, arenaCenter } from '../arena.js';
import { ARENA_RULESET, floorSupports, floorSupportsBox } from '../floor.js';
import { CLASSIC_STAGES } from './classic-stages.js';
import { COMPOSED_MAPS, LARGER_MAPS, CTF_MAPS } from './composed-maps.js';
import { SIMULATION_MAP, SIMULATION_MAP_V1, SIMULATION_MAP_V2 } from './simulation-map.js';
import { validateCtfBases } from '../ctf.js';
const spawnSets = {
  2: [
    [120, 320],
    [840, 320],
  ],
  3: [
    [480, 60],
    [220, 460],
    [740, 460],
  ],
  4: [
    [120, 120],
    [840, 520],
    [840, 120],
    [120, 520],
  ],
};
const respawns = [
  [120, 120],
  [840, 520],
  [840, 120],
  [120, 520],
  [120, 320],
  [840, 320],
  [480, 80],
  [480, 560],
  [360, 320],
  [600, 320],
  [480, 240],
  [480, 400],
  [480, 320],
];
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
function define(raw) {
  const walls = raw.walls || [],
    hazards = raw.hazards || [],
    pads = raw.pads || [],
    width = raw.width ?? WIDTH,
    height = raw.height ?? HEIGHT;
  return freeze({
    ...raw,
    revision: raw.revision ?? 1,
    width,
    height,
    tileSize: TILE,
    walls,
    hazards,
    pads,
    surfaces: raw.surfaces || [],
    objects: raw.objects || [],
    spawnSets: raw.spawnSets || spawnSets,
    respawnCandidates: raw.respawnCandidates || respawns,
    tiles: Array.from({ length: height / TILE }, (_, y) =>
      Array.from({ length: width / TILE }, (_, x) =>
        walls.some(
          (r) =>
            x * TILE + TILE / 2 >= r.x &&
            x * TILE + TILE / 2 <= r.x + r.w &&
            y * TILE + TILE / 2 >= r.y &&
            y * TILE + TILE / 2 <= r.y + r.h,
        )
          ? '#'
          : '.',
      ).join(''),
    ),
  });
}
const REVISION_ONE_MAPS = freeze([
  ...CLASSIC_STAGES.map((map) =>
    define({
      ...map,
      spawnSets: {
        ...spawnSets,
        3: [
          [120, 120],
          [840, 520],
          [840, 120],
        ],
      },
      engines: ['classic', 'composed'],
      theme: map.id,
      legend: [],
    }),
  ),
  ...COMPOSED_MAPS.map(define),
]);
// Revision two of three maps moved the three-player spawns. A new revision shares
// the frozen data it does not change.
const THREE_PLAYER_SPAWNS_V2 = {
  'perimeter-foundry': [
    [480, 100],
    [240, 320],
    [720, 320],
  ],
  'split-rooftops': [
    [120, 80],
    [840, 80],
    [480, 520],
  ],
  'ice-bowl': [
    [480, 120],
    [280, 320],
    [720, 320],
  ],
};
/** Every published revision of every map. */
export const MAP_REVISIONS = freeze([
  ...REVISION_ONE_MAPS,
  ...Object.entries(THREE_PLAYER_SPAWNS_V2).map(([id, positions]) => {
    const base = REVISION_ONE_MAPS.find((map) => map.id === id);
    return freeze({ ...base, revision: 2, spawnSets: { ...base.spawnSets, 3: positions } });
  }),
  ...LARGER_MAPS.map(define),
  ...CTF_MAPS.map(define),
  define(SIMULATION_MAP_V1),
  define(SIMULATION_MAP_V2),
  define(SIMULATION_MAP),
]);
const byId = new Map();
for (const map of MAP_REVISIONS) {
  const revisions = byId.get(map.id) || new Map();
  if (revisions.has(map.revision)) throw Error(`Duplicate map revision: ${map.id}/${map.revision}`);
  revisions.set(map.revision, map);
  byId.set(map.id, revisions);
}
/** The latest revision of each map, in published order. */
export const MAP_CATALOG = freeze(
  [...byId.values()].map((revisions) => revisions.get(Math.max(...revisions.keys()))),
);
/** Whether the engine named by this ID or alias can run the map. */
export function supportsMapEdition(map, mechanicsVersion) {
  return map.engines.includes(getMechanicsVersion(mechanicsVersion)?.id);
}
/** The latest revision of each map the engine can play. */
export function getMaps(mechanicsVersion = DEFAULT_MECHANICS_VERSION) {
  return MAP_CATALOG.filter(
    (map) => !map.simulationOnly && supportsMapEdition(map, mechanicsVersion),
  );
}
export const MAP_SELECTION_CATALOG = freeze({
  revision: 2,
  retiredIds: ['garden', 'reactor', 'foundry-belts'],
});
/** User-facing choices are separate from historical replay/calibration lookup. */
export function getSelectableMaps(mechanicsVersion = DEFAULT_MECHANICS_VERSION) {
  return getMaps(mechanicsVersion).filter(
    (map) => !MAP_SELECTION_CATALOG.retiredIds.includes(map.id),
  );
}
/** Omit revision only when choosing a map for a new round or a selector. */
export function getMap(id, mechanicsVersion = DEFAULT_MECHANICS_VERSION, revision) {
  const revisions = byId.get(id),
    map =
      revision === undefined ? MAP_CATALOG.find((map) => map.id === id) : revisions?.get(revision);
  if (!map || !supportsMapEdition(map, mechanicsVersion))
    throw Error('This map revision is not supported by the selected mechanics version.');
  return map;
}
const overlaps = (x, y, radius, r) => {
  const dx = x - Math.max(r.x, Math.min(r.x + r.w, x)),
    dy = y - Math.max(r.y, Math.min(r.y + r.h, y));
  return dx * dx + dy * dy < radius * radius;
};
// A larger arena is a multiple of the tile, no smaller than the default and no
// larger than the maximum. The internal simulation arena is the smaller exception.
const arenaSizeAllowed = (def) =>
  [def.width / TILE, def.height / TILE].every(Number.isInteger) &&
  def.width >= (def.simulationOnly ? 400 : WIDTH) &&
  def.width <= MAX_WIDTH &&
  def.height >= (def.simulationOnly ? 400 : HEIGHT) &&
  def.height <= MAX_HEIGHT &&
  ((def.width === WIDTH && def.height === HEIGHT) ||
    def.simulationOnly ||
    !def.engines?.includes('classic'));
export function validateMap(def) {
  if (
    !def ||
    !Number.isSafeInteger(def.revision) ||
    def.revision < 1 ||
    !arenaSizeAllowed(def) ||
    def.objects.length > 32 ||
    def.surfaces.length > 4 ||
    (def.controllers?.length || 0) > 4
  )
    throw Error('Unsupported map definition.');
  for (const r of [...def.walls, ...def.objects, ...def.surfaces])
    if (
      ![r.x, r.y, r.w, r.h].every(Number.isFinite) ||
      r.w <= 0 ||
      r.h <= 0 ||
      r.x < BORDER ||
      r.y < BORDER ||
      r.x + r.w > def.width - BORDER ||
      r.y + r.h > def.height - BORDER
    )
      throw Error('Invalid map footprint.');
  if (def.floorMask) {
    if (
      def.requiredRuleset !== ARENA_RULESET ||
      def.floorMask.length !== def.height / TILE ||
      def.floorMask.some((row) => row.length !== def.width / TILE || /[^#.]/.test(row))
    )
      throw Error('Invalid floor mask or ruleset.');
    if (!floorSupports(def, arenaCenter(def).x, arenaCenter(def).y, 75))
      throw Error('The hill needs supporting floor.');
    if (def.objects.some((object) => !floorSupportsBox(def, object)))
      throw Error('Breakable terrain needs supporting floor.');
    for (const c of def.controllers)
      if (
        !['perimeter', 'rotation'].includes(c.kind) ||
        !Number.isFinite(c.speed) ||
        c.speed <= 0 ||
        c.speed > 2.25 ||
        !Number.isInteger(c.period) ||
        c.period < 1 ||
        c.period > 3600
      )
        throw Error('Invalid surface controller.');
  }
  for (const count of [2, 3, 4]) {
    if (def.spawnSets[count]?.length !== count) throw Error('Missing spawn set.');
    for (const [x, y] of def.spawnSets[count])
      if (
        !floorSupports(def, x, y, 13) ||
        [...def.walls, ...def.objects].some((w) => overlaps(x, y, 13, w))
      )
        throw Error('Spawn overlaps cover or unsupported floor.');
  }
  validateCtfBases(def);
  return def;
}
for (const map of MAP_REVISIONS) validateMap(map);
