// Room settings: one row per setting, in lobby order. Saved rules, the room
// server, the wire schemas and the lobby form derive from these rows.
//
// kind     integer | enum | boolean | features | map. Features and map
//          values are checked against content, which this layer cannot import.
// range    integers the wire accepts; input rounds and clamps into it.
// values   what the lobby offers and saved rules keep. An integer without
//          values is a free number field.
// max      a limit that depends on other settings.
// engine   whether createMatch reads it. The rest shape the draft and lobby.
// group    ruleset | arena | round | advanced. Advanced rows sit in a
//          collapsed section of the lobby form.
// control  select | checkbox | number | features | map | autostart.
//          Autostart is rendered beside the Start control.
// id       the lobby element id suffix when it differs from the key.
// applies  when the lobby offers the row; other rulesets ignore the value.
import { LOADOUT_SIZE } from './limits.js';
import {
  DEFAULT_MECHANICS_VERSION,
  MECHANICS_VERSIONS,
  normalizeMechanicsVersion,
} from './versions.js';

export const ROOM_SETTING_GROUPS = Object.freeze(['ruleset', 'arena', 'round', 'advanced']);
const MODE_LABELS = {
  timed: 'Most kills',
  lives: 'Last one standing',
  hill: 'King of the hill',
  ctf: 'Capture the flag',
};
const versionLabels = Object.fromEntries(MECHANICS_VERSIONS.map((v) => [v.id, v.label]));
const composed = (s) => s.mechanicsVersion === 'composed';
const upTo = (n, from = 1) => Array.from({ length: n - from + 1 }, (_, i) => from + i);

const rows = [
  {
    key: 'mechanicsVersion',
    kind: 'enum',
    group: 'ruleset',
    control: 'select',
    wide: true,
    label: 'MOVE RULESET',
    values: MECHANICS_VERSIONS.map((v) => v.id),
    format: (v) => versionLabels[v],
    // Accepts retired aliases; a missing or unknown edition keeps the fallback.
    normalize: normalizeMechanicsVersion,
    default: DEFAULT_MECHANICS_VERSION,
    engine: true,
  },
  {
    key: 'teamBattle',
    kind: 'boolean',
    group: 'ruleset',
    control: 'checkbox',
    label: 'Team battle',
    default: false,
    engine: true,
  },
  {
    key: 'exclusiveMoves',
    kind: 'boolean',
    group: 'ruleset',
    control: 'checkbox',
    label: 'Exclusive moves',
    default: false,
    engine: false,
  },
  {
    key: 'disabledFeatures',
    kind: 'features',
    group: 'ruleset',
    control: 'features',
    label: 'MOVE FEATURES',
    default: [],
    engine: false,
  },
  {
    key: 'stage',
    kind: 'map',
    group: 'arena',
    control: 'map',
    label: 'MAP',
    default: 'foundry',
    engine: true,
  },
  {
    key: 'mode',
    kind: 'enum',
    group: 'round',
    control: 'select',
    wide: true,
    label: 'GAME MODE',
    values: Object.keys(MODE_LABELS),
    format: (v) => MODE_LABELS[v],
    default: 'timed',
    engine: true,
  },
  {
    key: 'timeLimit',
    id: 'time',
    kind: 'integer',
    group: 'round',
    control: 'select',
    label: 'TIME LIMIT',
    range: [30, 600],
    values: [30, 60, 120, 180, 300],
    format: (v) => (v < 60 ? v + ' seconds' : v / 60 + ' minutes'),
    default: 120,
    engine: true,
  },
  {
    key: 'lives',
    kind: 'integer',
    group: 'round',
    control: 'select',
    label: 'LIVES',
    range: [1, 10],
    values: [1, 2, 3, 4, 5],
    format: (v) => v + ' lives',
    default: 3,
    engine: true,
  },
  {
    key: 'healthPercent',
    kind: 'integer',
    group: 'round',
    control: 'number',
    label: 'PLAYER HEALTH (%)',
    range: [10, 500],
    default: 100,
    engine: true,
  },
  {
    key: 'moves',
    kind: 'integer',
    group: 'round',
    control: 'select',
    label: 'MOVES PER PLAYER',
    range: [1, LOADOUT_SIZE],
    values: upTo(LOADOUT_SIZE),
    format: (v) => v + ' moves',
    default: 3,
    engine: false,
  },
  {
    key: 'autoStart',
    kind: 'boolean',
    group: 'round',
    control: 'autostart',
    label: 'Autostart',
    default: false,
    engine: false,
  },
  {
    key: 'bans',
    kind: 'integer',
    group: 'round',
    control: 'select',
    label: 'BANS PER PLAYER',
    range: [0, LOADOUT_SIZE - 1],
    values: upTo(LOADOUT_SIZE - 1, 0),
    format: (v) => v + ' ' + (v === 1 ? 'ban' : 'bans'),
    max: (settings) => settings.moves - 1,
    default: 1,
    engine: false,
  },
  {
    key: 'shrinkAfter',
    id: 'shrink',
    kind: 'integer',
    group: 'round',
    control: 'select',
    wide: true,
    label: 'SURVIVAL ARENA SHRINKS AFTER',
    range: [0, 600],
    values: [0, 15, 30, 60, 120],
    format: (v) => (v ? v + ' seconds' : 'Never'),
    default: 60,
    engine: true,
  },
  {
    key: 'playerAttackColors',
    kind: 'boolean',
    group: 'advanced',
    control: 'checkbox',
    label: 'Match attack colours to players (original damage colour stays at the core)',
    default: false,
    engine: false,
  },
  {
    key: 'friendlyFire',
    kind: 'boolean',
    group: 'advanced',
    control: 'checkbox',
    label: 'Friendly fire',
    default: true,
    applies: (s) => composed(s) && s.teamBattle,
    engine: true,
  },
  {
    key: 'speedPercent',
    id: 'speed',
    kind: 'integer',
    group: 'advanced',
    control: 'select',
    label: 'PLAYER MOVEMENT SPEED',
    help: 'Walking and dash speed; attacks and timers stay unchanged.',
    range: [60, 160],
    values: [60, 80, 100, 120, 140, 160],
    format: (v) => (v / 100).toFixed(1) + '×',
    default: 100,
    applies: composed,
    engine: true,
  },
  {
    key: 'botDifficulty',
    kind: 'enum',
    group: 'advanced',
    control: 'select',
    label: 'BOT DIFFICULTY',
    values: ['normal', 'moderate', 'hard'],
    format: (v) => v[0].toUpperCase() + v.slice(1),
    default: 'normal',
    applies: composed,
    engine: true,
  },
  {
    key: 'itemDrops',
    id: 'items',
    kind: 'enum',
    group: 'advanced',
    control: 'select',
    label: 'ITEM DROPS',
    values: ['off', 'rare', 'normal', 'frequent'],
    format: (v) => v[0].toUpperCase() + v.slice(1),
    default: 'off',
    applies: composed,
    engine: true,
  },
];

const freeze = (row) =>
  Object.freeze({
    ...row,
    ...(row.range && { range: Object.freeze(row.range) }),
    ...(row.values && { values: Object.freeze(row.values) }),
    ...(Array.isArray(row.default) && { default: Object.freeze(row.default) }),
  });
export const ROOM_SETTINGS = Object.freeze(rows.map(freeze));
export const ROOM_SETTING = Object.freeze(Object.fromEntries(ROOM_SETTINGS.map((r) => [r.key, r])));

export const DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(ROOM_SETTINGS.map((row) => [row.key, row.default])),
);
/** Integer wire limits, `[min, max]` by key. */
export const ROOM_SETTING_LIMITS = Object.freeze(
  Object.fromEntries(
    ROOM_SETTINGS.filter((row) => row.kind === 'integer').map((row) => [row.key, row.range]),
  ),
);
/** Keys createMatch reads. */
export const ENGINE_SETTING_KEYS = Object.freeze(
  ROOM_SETTINGS.filter((row) => row.engine).map((row) => row.key),
);

/** Round and clamp a finite number into an integer row's range. */
export function clampSetting(row, value) {
  const [min, max] = row.range;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * A stored or submitted value for an integer, enum or boolean row, or
 * `fallback` when it is not one the row keeps. Lobby rows keep only their
 * listed values; a free number field rounds and clamps.
 */
export function normalizeSetting(row, value, fallback = row.default) {
  if (row.normalize) return row.normalize(value, fallback);
  if (row.kind === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (row.values) return row.values.includes(value) ? value : fallback;
  return typeof value === 'number' && Number.isFinite(value) ? clampSetting(row, value) : fallback;
}

/** Apply limits that depend on other settings, such as bans below moves. */
export function applyDependentLimits(settings) {
  for (const row of ROOM_SETTINGS)
    if (row.max) settings[row.key] = Math.min(settings[row.key], row.max(settings));
  if (settings.mode === 'ctf') {
    if (settings.mechanicsVersion === 'composed') settings.teamBattle = true;
    else settings.mode = 'timed';
  }
  return settings;
}
