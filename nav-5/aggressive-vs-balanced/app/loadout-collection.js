import {
  MECHANICS_VERSIONS,
  SUPPORTED_MECHANICS_VERSIONS,
  getMechanicsVersion,
} from '../shared/protocol/versions.js';
import { HOTKEY_OPTIONS } from './preferences.js';
import { currentMoveName } from './move-name-migrations.js';

export const COLLECTION_KEY = 'rando.loadout-collection.v1';
export const COLLECTION_VERSION = 1;
export const MAX_SAVED_LOADOUTS = 24,
  MAX_FAVORITES = 200,
  MAX_SHARE_LENGTH = 2048;
const moveName = (name) =>
  typeof name === 'string' && /^[a-z0-9 ]{1,14}$/.test(name) && name.trim() === name;
const title = (name) =>
  typeof name === 'string' &&
  name.trim().length > 0 &&
  name.trim().length <= 40 &&
  !/[\u0000-\u001f\u007f]/.test(name);
const validVersion = (version) => SUPPORTED_MECHANICS_VERSIONS.includes(version);
const engineOf = (id) => (typeof id === 'string' ? getMechanicsVersion(id) : undefined);
// Everything saved for an engine: under its ID and, in a record written before the
// two Composed editions were merged, under its old IDs. Each list is capped where
// it was saved, so merging never drops something the player kept; an engine that
// ends up over a limit only has to delete before it can add.
const saved = (table, engine, limit) =>
  [engine.id, ...engine.aliases].flatMap((id) =>
    Array.isArray(table?.[id]) ? table[id].slice(0, limit) : [],
  );

// Strict at the import/editor boundary. Storage recovery drops damaged entries
// rather than silently changing the identity or order of moves inside a preset.
export function validateLoadout(raw) {
  const engine = raw && typeof raw === 'object' ? engineOf(raw.mechanicsVersion) : undefined;
  if (!engine) throw Error('This loadout uses an unsupported ruleset.');
  if (!title(raw.name)) throw Error('Name the loadout using 1–40 characters.');
  if (
    !Array.isArray(raw.moves) ||
    raw.moves.length < 1 ||
    raw.moves.length > 5 ||
    raw.moves.some((name) => name !== '' && !moveName(name))
  )
    throw Error('Moves must use exact library names: 1–14 lowercase letters, numbers or spaces.');
  const moves = raw.moves.map((name) => currentMoveName(name, engine.id));
  const names = moves.filter(Boolean);
  if (!names.length) throw Error('Choose at least one move to save.');
  if (new Set(names).size !== names.length) throw Error('Choose a different move for each slot.');
  const result = {
    mechanicsVersion: engine.id,
    name: raw.name.trim(),
    moves: Array.from({ length: 5 }, (_, i) => moves[i] || ''),
  };
  if (raw.hotkeys !== undefined) {
    if (
      !Array.isArray(raw.hotkeys) ||
      raw.hotkeys.length > 5 ||
      raw.hotkeys.some((key) => !HOTKEY_OPTIONS.includes(key))
    )
      throw Error('This loadout contains an unsupported hotkey.');
    const keys = raw.hotkeys.filter(Boolean);
    if (new Set(keys).size !== keys.length) throw Error('Use each extra hotkey only once.');
    result.hotkeys = Array.from({ length: 5 }, (_, i) => raw.hotkeys[i] || '');
  }
  return result;
}
export function normalizeCollection(raw) {
  const result = { version: COLLECTION_VERSION, favorites: {}, loadouts: {} };
  // v0 was an unversioned local draft shape; v1 adds explicit bounded records.
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw.version !== undefined && ![0, COLLECTION_VERSION].includes(raw.version))
  )
    raw = {};
  for (const engine of MECHANICS_VERSIONS) {
    const version = engine.id;
    result.favorites[version] = [
      ...new Set(
        saved(raw.favorites, engine, MAX_FAVORITES)
          .filter(moveName)
          .map((name) => currentMoveName(name, version)),
      ),
    ];
    const ids = new Set();
    result.loadouts[version] = [];
    for (const item of saved(raw.loadouts, engine, MAX_SAVED_LOADOUTS)) {
      try {
        const value = validateLoadout({ ...item, mechanicsVersion: version });
        const id =
          typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(item.id)
            ? item.id
            : 'migrated-' + result.loadouts[version].length;
        if (ids.has(id)) continue;
        ids.add(id);
        result.loadouts[version].push({ id, ...value });
      } catch {}
    }
  }
  return result;
}
export function readCollection(storage) {
  try {
    storage ??= globalThis.localStorage;
    const raw = storage.getItem(COLLECTION_KEY);
    if (raw?.length > 200000) return normalizeCollection();
    return normalizeCollection(JSON.parse(raw));
  } catch {
    return normalizeCollection();
  }
}
export function writeCollection(collection, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      COLLECTION_KEY,
      JSON.stringify(normalizeCollection(collection)),
    );
    if (!storage && typeof window !== 'undefined')
      window.dispatchEvent(new Event('collection-changed'));
    return true;
  } catch {
    return false;
  }
}
export function toggleFavorite(collection, version, name) {
  if (!validVersion(version) || !moveName(name))
    throw Error('Choose an existing move to favorite.');
  const names = (collection.favorites[version] ??= []);
  const index = names.indexOf(name);
  if (index >= 0) names.splice(index, 1);
  else {
    if (names.length >= MAX_FAVORITES)
      throw Error(`You can favorite up to ${MAX_FAVORITES} moves per ruleset.`);
    names.push(name);
  }
  return names.includes(name);
}
export function sortedMoveSuggestions(
  library,
  { query = '', favorites = [], excluded = [], limit = 8 } = {},
) {
  const favoriteSet = new Set(favorites),
    excludedSet = new Set(excluded);
  return library
    .filter((move) => !excludedSet.has(move.name) && move.name.includes(query))
    .map((move, index) => ({ move, index }))
    .sort(
      (a, b) =>
        Number(favoriteSet.has(b.move.name)) - Number(favoriteSet.has(a.move.name)) ||
        a.index - b.index,
    )
    .slice(0, limit)
    .map((item) => item.move);
}
export function saveNamedLoadout(collection, raw, id) {
  const value = validateLoadout(raw),
    items = (collection.loadouts[value.mechanicsVersion] ??= []);
  const index = id === undefined ? -1 : items.findIndex((item) => item.id === id);
  if (id !== undefined && index < 0) throw Error('This saved loadout no longer exists.');
  if (index < 0 && items.length >= MAX_SAVED_LOADOUTS)
    throw Error(`You can save up to ${MAX_SAVED_LOADOUTS} loadouts per ruleset. Delete one first.`);
  const item = { id: index >= 0 ? id : globalThis.crypto.randomUUID(), ...value };
  if (index >= 0) items[index] = item;
  else items.push(item);
  return item;
}
export function deleteNamedLoadout(collection, version, id) {
  const list = collection.loadouts[version];
  if (!list) return false;
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
}
export function resolveLoadout(raw, library, count = 5) {
  const preset = validateLoadout(raw),
    names = new Set(library.map((move) => (typeof move === 'string' ? move : move.name)));
  const missing = preset.moves
    .map((name, slot) => ({ name, slot }))
    .filter((item) => item.name && !names.has(item.name));
  return {
    moves: preset.moves.map((name) => (names.has(name) ? name : '')),
    missing,
    hidden: preset.moves.slice(Math.max(0, Math.min(5, count))).filter(Boolean),
  };
}
export function encodeLoadout(raw) {
  const preset = validateLoadout(raw),
    bytes = new TextEncoder().encode(JSON.stringify({ v: 1, ...preset }));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  if (encoded.length > MAX_SHARE_LENGTH) throw Error('This loadout link is too long.');
  return encoded;
}
export function decodeLoadout(encoded) {
  if (
    typeof encoded !== 'string' ||
    encoded.length > MAX_SHARE_LENGTH ||
    !encoded.length ||
    !/^[\w-]+$/.test(encoded)
  )
    throw Error('This loadout link is invalid or too long.');
  let data;
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    );
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw Error('This loadout link is damaged.');
  }
  if (data?.v !== 1) throw Error('This loadout link uses an unsupported share format.');
  return validateLoadout(data);
}
export function sharedLoadoutURL(raw, currentURL, serverId) {
  const url = new URL(currentURL);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  if (serverId) url.searchParams.set('server', serverId);
  url.hash = 'loadout=' + encodeLoadout(raw);
  return url.href;
}
export function readSharedLoadout(url) {
  const hash = new URL(url).hash.slice(1);
  if (!hash.startsWith('loadout=')) return null;
  try {
    return { loadout: decodeLoadout(hash.slice(8)) };
  } catch (error) {
    return { error: error.message };
  }
}
