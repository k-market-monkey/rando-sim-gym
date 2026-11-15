import { normalizePreferences } from './preferences.js';
import { normalizeCollection, MAX_FAVORITES, MAX_SAVED_LOADOUTS } from './loadout-collection.js';
import { normalizeExtraPreferences } from './extra-preferences.js';

export function syncData(raw) {
  // loadout is derived from the active edition; merge its canonical table once.
  const { loadout: _loadout, ...preferences } = normalizePreferences(raw.preferences);
  return {
    preferences,
    collection: normalizeCollection(raw.collection),
    extraPreferences: normalizeExtraPreferences(raw.extraPreferences),
  };
}

export function sameData(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key]))
  );
}

// Only values changed differently on both sides require a decision. Move-slot
// arrays stay atomic; favorites merge by membership and saved loadouts by ID.
export function reconcileData(baseline, local, cloud) {
  const conflicts = [];
  function merge(base, ours, theirs, path) {
    if (sameData(ours, theirs) || sameData(base, theirs)) return ours;
    if (sameData(base, ours)) return theirs;
    if ([base, ours, theirs].every(Array.isArray)) {
      if (path.startsWith('collection.favorites.')) {
        const names = [...new Set([...ours, ...theirs])].filter(
          (name) => !base.includes(name) || (ours.includes(name) && theirs.includes(name)),
        );
        if (names.length <= MAX_FAVORITES) return names;
      } else if (path.startsWith('collection.loadouts.')) {
        const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));
        const before = byId(base),
          local = byId(ours),
          cloud = byId(theirs);
        const items = [...new Set([...ours, ...theirs].map((item) => item.id))]
          .map((id) => merge(before[id], local[id], cloud[id], `${path}.${id}`))
          .filter(Boolean);
        if (items.length <= MAX_SAVED_LOADOUTS) return items;
      }
    }
    if (
      [base, ours, theirs].every(
        (value) => value && typeof value === 'object' && !Array.isArray(value),
      )
    )
      return Object.fromEntries(
        [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])].map(
          (key) => [key, merge(base[key], ours[key], theirs[key], path ? `${path}.${key}` : key)],
        ),
      );
    conflicts.push(path);
    return ours;
  }
  return { data: merge(baseline, local, cloud, ''), conflicts };
}
