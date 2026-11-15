// Combat IDs distinguish the complete pinned definitions, including tuned values.
// They are display metadata, independent of public generation/library identities.
import { BUILTIN_SHOOT } from '../../content/composed/fixtures.js';
export const SWIPE_MOVE = Object.freeze({
  name: 'Swipe',
  builtin: 'swipe',
  coreColor: '#ffffff',
  selfDamage: false,
});
export const SWIPE_KEY = 'builtin:swipe';
/** Shoot spawns ordinary checked bullets, so its definition is a full move. */
export const SHOOT_MOVE = BUILTIN_SHOOT;
export const SHOOT_KEY = 'builtin:shoot';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const definitions = new WeakMap();
const serialized = (move) => {
  if (!definitions.has(move)) definitions.set(move, JSON.stringify(canonical(move)));
  return definitions.get(move);
};

/** First full definition in canonical seat/slot order owns the round key. */
export function createCombatMoves(players) {
  const seen = new Map(),
    entries = {};
  for (const [playerIndex, player] of players.entries())
    for (const [slot, move] of player.loadout.entries()) {
      const definition = serialized(move);
      if (seen.has(definition)) continue;
      const key = `move:${seen.size}`;
      seen.set(definition, key);
      entries[key] = { name: move.name, playerIndex, slot };
    }
  entries[SWIPE_KEY] = { name: 'Swipe', builtin: 'swipe' };
  // Browsers draw shots from this copy; no loadout carries the definition.
  entries[SHOOT_KEY] = { name: 'Shoot', builtin: 'shoot', definition: structuredClone(SHOOT_MOVE) };
  return entries;
}

const dictionaries = new WeakMap();
/** Rebuildable after JSON restore; no name or colour can substitute for equality. */
export function combatMoveKey(state, move) {
  if (!move) return undefined;
  if (move === SWIPE_MOVE) return SWIPE_KEY;
  if (builtinAction(move) === 'shoot') return SHOOT_KEY;
  if (!state.combatMoves) return undefined;
  let keys = dictionaries.get(state.combatMoves);
  if (!keys) {
    keys = new Map();
    for (const [key, entry] of Object.entries(state.combatMoves)) {
      if (entry.builtin) continue;
      const definition = state.players[entry.playerIndex]?.loadout[entry.slot];
      if (definition) keys.set(serialized(definition), key);
    }
    dictionaries.set(state.combatMoves, keys);
  }
  return keys.get(serialized(move));
}

/** The built-in action a move belongs to, also for bullets restored from JSON. */
export function builtinAction(move) {
  if (move === SWIPE_MOVE) return 'swipe';
  if (
    move === SHOOT_MOVE ||
    (move?.name === SHOOT_MOVE.name && serialized(move) === serialized(SHOOT_MOVE))
  )
    return 'shoot';
  return null;
}
