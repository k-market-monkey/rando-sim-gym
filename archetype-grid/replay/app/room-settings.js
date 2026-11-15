import { getSelectableMaps } from '../shared/content/maps/catalog.js';
import {
  ROOM_SETTINGS,
  DEFAULT_SETTINGS,
  normalizeSetting,
  applyDependentLimits,
} from '../shared/protocol/room-settings.js';
import { normalizeDisabledFeatures } from '../shared/content/composed/move-features.js';

export const ROOM_SETTINGS_KEY = 'rando.roomSettings.v1';
export const DEFAULT_ROOM_SETTINGS = DEFAULT_SETTINGS;

/** Keep saved rules compatible with the room controls; never retain access credentials. */
export function normalizeRoomSettings(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const settings = { ...DEFAULT_ROOM_SETTINGS };
  for (const row of ROOM_SETTINGS)
    if (row.kind === 'features') settings[row.key] = normalizeDisabledFeatures(raw[row.key]);
    else if (row.kind !== 'map') settings[row.key] = normalizeSetting(row, raw[row.key]);
  if (getSelectableMaps(settings.mechanicsVersion).some((map) => map.id === raw.stage))
    settings.stage = raw.stage;
  applyDependentLimits(settings);
  if (
    settings.mode === 'ctf' &&
    !getSelectableMaps(settings.mechanicsVersion)
      .find((map) => map.id === settings.stage)
      ?.supportedModes?.includes('ctf')
  )
    settings.stage = 'harbour-yard';
  return settings;
}

export function loadRoomSettings(storage) {
  try {
    storage ??= globalThis.localStorage;
    return normalizeRoomSettings(JSON.parse(storage.getItem(ROOM_SETTINGS_KEY)));
  } catch {
    return { ...DEFAULT_ROOM_SETTINGS };
  }
}

export function saveRoomSettings(raw, storage) {
  try {
    storage ??= globalThis.localStorage;
    const previous = storage.getItem(ROOM_SETTINGS_KEY);
    storage.setItem(ROOM_SETTINGS_KEY, JSON.stringify(normalizeRoomSettings(raw)));
    if (storage === globalThis.localStorage && previous !== storage.getItem(ROOM_SETTINGS_KEY))
      globalThis.window?.dispatchEvent(new Event('preferences-changed'));
    return true;
  } catch {
    return false;
  }
}
