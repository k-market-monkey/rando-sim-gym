import {
  DEFAULT_MECHANICS_VERSION,
  LEGACY_MECHANICS_VERSION,
  normalizeMechanicsVersion,
} from '../shared/protocol/versions.js';
import { PREFERENCES_KEY, normalizePreferences } from './preferences.js';
import { ROOM_SETTINGS_KEY } from './room-settings.js';

/** Set once the browser has been moved to the default edition, so a later choice of Classic sticks. */
export const DEFAULT_EDITION_APPLIED_KEY = 'rando.defaultEditionApplied';
const APPLIED = 'composed';

/**
 * Browsers that used the game while Classic was the only or default edition
 * have Classic saved. Move them to the default edition once. Their Classic
 * loadout stays saved under Classic, and choosing Classic again afterwards is
 * respected because the marker is already set.
 */
export function applyDefaultEditionOnce(storage) {
  try {
    storage ??= globalThis.localStorage;
    if (storage.getItem(DEFAULT_EDITION_APPLIED_KEY) === APPLIED) return false;
    let changed = false;
    const savedPreferences = storage.getItem(PREFERENCES_KEY);
    if (savedPreferences) {
      const preferences = normalizePreferences(JSON.parse(savedPreferences));
      if (preferences.activeMechanicsVersion === LEGACY_MECHANICS_VERSION) {
        preferences.activeMechanicsVersion = DEFAULT_MECHANICS_VERSION;
        preferences.loadout = preferences.loadoutsByVersion[DEFAULT_MECHANICS_VERSION];
        storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
        changed = true;
      }
    }
    const savedRoom = storage.getItem(ROOM_SETTINGS_KEY);
    if (savedRoom) {
      const settings = JSON.parse(savedRoom);
      const version = normalizeMechanicsVersion(
        settings?.mechanicsVersion,
        LEGACY_MECHANICS_VERSION,
      );
      if (settings && typeof settings === 'object' && version === LEGACY_MECHANICS_VERSION) {
        storage.setItem(
          ROOM_SETTINGS_KEY,
          JSON.stringify({ ...settings, mechanicsVersion: DEFAULT_MECHANICS_VERSION }),
        );
        changed = true;
      }
    }
    storage.setItem(DEFAULT_EDITION_APPLIED_KEY, APPLIED);
    return changed;
  } catch {
    return false;
  }
}
