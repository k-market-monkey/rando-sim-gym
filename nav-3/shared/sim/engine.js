// The engine boundary: every caller creates and steps matches here, and the
// state's format number selects the engine that runs it.
import * as classic from './classic/engine.js';
import * as composed from './composed/engine.js';
import { getMechanicsVersion, LEGACY_MECHANICS_VERSION } from '../protocol/versions.js';
export { TICK_RATE, MAX_ENTITIES } from './classic/engine.js';
const ENGINES = { 1: classic, 3: composed };
export function createMatch(options = {}) {
  const version = getMechanicsVersion(options.mechanicsVersion || LEGACY_MECHANICS_VERSION);
  if (!version) throw Error('Unknown mechanics version');
  if (
    options.players?.some((p) => p.loadout?.some((m) => m.formatVersion !== version.formatVersion))
  )
    throw Error('A match cannot mix mechanics formats');
  return ENGINES[version.formatVersion].createMatch(options);
}
const engine = (state) => {
  const found = ENGINES[state.formatVersion];
  if (!found) throw Error('Unknown mechanics format');
  return found;
};
export const step = (state, inputs) => engine(state).step(state, inputs);
export const botInput = (state, id) => engine(state).botInput(state, id);
export const stateHash = (state) => engine(state).stateHash(state);
/** State fields that the hash neither covers nor names as left out. Empty when all is well. */
export const unlistedStateFields = (state) => engine(state).unlistedStateFields(state);
