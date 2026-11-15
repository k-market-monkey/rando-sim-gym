import { loadRoomSettings, normalizeRoomSettings, ROOM_SETTINGS_KEY } from './room-settings.js';
import {
  loadPlayerSettings,
  normalizePlayerSettings,
  PLAYER_SETTINGS_KEY,
} from './player-settings.js';

// Explicit allowlists in the normalizers exclude passwords, server and room session data.
export function normalizeExtraPreferences(raw) {
  return {
    roomSettings: normalizeRoomSettings(raw?.roomSettings),
    displaySettings: normalizePlayerSettings(raw?.displaySettings),
  };
}
export function loadExtraPreferences() {
  return { roomSettings: loadRoomSettings(), displaySettings: loadPlayerSettings() };
}
export function saveExtraPreferences(raw) {
  try {
    const normalized = normalizeExtraPreferences(raw);
    localStorage.setItem(ROOM_SETTINGS_KEY, JSON.stringify(normalized.roomSettings));
    localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(normalized.displaySettings));
    return true;
  } catch {
    return false;
  }
}
