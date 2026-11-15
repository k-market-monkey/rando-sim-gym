// Combat IDs distinguish the complete pinned definitions, including tuned values.
// They are display metadata, independent of public generation/library identities.
export const MELEE_MOVE = Object.freeze({
  name: 'Melee',
  builtin: 'melee',
  coreColor: '#ffffff',
  selfDamage: false,
});
export const MELEE_KEY = 'builtin:melee';

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
  entries[MELEE_KEY] = { name: 'Melee', builtin: 'melee' };
  return entries;
}

const dictionaries = new WeakMap();
/** Rebuildable after JSON restore; no name or colour can substitute for equality. */
export function combatMoveKey(state, move) {
  if (!move) return undefined;
  if (move === MELEE_MOVE) return MELEE_KEY;
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
