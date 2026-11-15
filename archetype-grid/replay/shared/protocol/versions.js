// The engines the game can run. A room, a saved loadout and a library move each
// name one engine by `id`; rooms and the API carry it in a field still called
// `mechanicsVersion`.
//
// `aliases` are IDs that were published before the two Composed editions were
// merged. They are accepted wherever an ID is read (requests, stored browser
// data, library files) and are never written.
//
// DEFAULT is what a new player and a newly created room start with.
// LEGACY is what stored data and requests that carry no ID mean: they predate
// the choice of engine, so they are Classic. Changing LEGACY would re-file old data.
export const DEFAULT_MECHANICS_VERSION = 'composed';
export const LEGACY_MECHANICS_VERSION = 'classic';
export const MECHANICS_VERSIONS = Object.freeze([
  Object.freeze({
    id: 'classic',
    build: 'classic-b3',
    aliases: Object.freeze(['classic-v1']),
    label: 'Classic',
    description: 'The original eight move types.',
    formatVersion: 1,
    components: false,
    runtimeVersion: 'classic-runtime-v1',
    rulesVersion: 'arena-rules-v1',
    generatorVersion: 'classic-generator-v1',
    calibrationVersion: 'classic-standard-duels-v5-blocks',
  }),
  Object.freeze({
    id: 'composed',
    build: 'composed-b9',
    aliases: Object.freeze(['composed-v2', 'composed-v3']),
    label: 'Composed',
    description:
      'Component moves: melee, tethers, constructs, support, reflected lasers, homing, companions, teleport and decoys.',
    formatVersion: 3,
    components: true,
    runtimeVersion: 'composed-plus-runtime-v1',
    rulesVersion: 'arena-rules-v3',
    generatorVersion: 'composed-plus-generator-v2',
    calibrationVersion: 'composed-standard-duels-v7-blocks',
  }),
]);
export const SUPPORTED_MECHANICS_VERSIONS = Object.freeze(
  MECHANICS_VERSIONS.map((version) => version.id),
);
const byId = new Map(
  MECHANICS_VERSIONS.flatMap((version) =>
    [version.id, ...version.aliases].map((id) => [id, version]),
  ),
);
const named = (id) => (typeof id === 'string' ? byId.get(id) : undefined);
/** The engine an ID or alias names, or undefined. A missing ID means LEGACY. */
export function getMechanicsVersion(id = LEGACY_MECHANICS_VERSION) {
  return named(id);
}
/** The engine that runs moves and states of this format number, or undefined. */
export function mechanicsVersionForFormat(formatVersion) {
  return MECHANICS_VERSIONS.find((version) => version.formatVersion === formatVersion);
}
/** Whether moves and match states of this format are built from components rather than Classic's fixed move types. */
export function isComponentFormat(formatVersion) {
  return mechanicsVersionForFormat(formatVersion)?.components === true;
}
/** The current ID for an ID or alias; the fallback when it is missing or names no engine. */
export function normalizeMechanicsVersion(value, fallback = DEFAULT_MECHANICS_VERSION) {
  return named(value)?.id || named(fallback)?.id || DEFAULT_MECHANICS_VERSION;
}
