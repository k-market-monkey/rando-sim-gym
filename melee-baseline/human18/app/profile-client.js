import {
  loadPreferences,
  savePreferences,
  normalizePreferences,
  DEFAULT_HOTKEYS,
  DEFAULT_BUILTIN_HOTKEYS,
} from './preferences.js';
import { applyDefaultEditionOnce } from './default-edition.js';
import { loadRoomSettings, normalizeRoomSettings, saveRoomSettings } from './room-settings.js';
import { resolveAppearance } from '../shared/sim/teams.js';
import { normalizeHandicapPercent } from '../shared/sim/health.js';

function immutable(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

/** Own browser preferences and profile edits; callers only receive immutable snapshots. */
export function createProfileClient({
  storage,
  context = () => ({}),
  send = () => {},
  changed = () => {},
} = {}) {
  applyDefaultEditionOnce(storage);
  const preferences = loadPreferences(storage);
  let profile = { ...preferences.profile },
    roomSettings = loadRoomSettings(storage),
    rememberRoomRules = false,
    profileSyncTimer,
    snapshot = immutable(structuredClone(preferences));
  const persist = () => {
    // Move slots win a key collision; a built-in sharing their key is unbound.
    const { hotkeys, builtinHotkeys } = normalizePreferences(preferences);
    Object.assign(preferences, { hotkeys, builtinHotkeys });
    savePreferences(preferences, storage);
    snapshot = immutable(structuredClone(preferences));
    changed();
  };
  return {
    get preferences() {
      return snapshot;
    },
    get profile() {
      return snapshot.profile;
    },
    get roomSettings() {
      return immutable(structuredClone(roomSettings));
    },
    appearance() {
      const { room, id } = context();
      return room?.settings.teamBattle
        ? resolveAppearance(
            { ...profile, teamColors: preferences.teamColors },
            room.players.find((p) => p.id === id)?.team,
          )
        : snapshot.profile;
    },
    selectEdition(version) {
      if (version === preferences.activeMechanicsVersion) return false;
      preferences.loadoutsByVersion[preferences.activeMechanicsVersion] = [...preferences.loadout];
      preferences.activeMechanicsVersion = version;
      preferences.loadout = [...(preferences.loadoutsByVersion[version] || Array(5).fill(''))];
      persist();
      return true;
    },
    setSound(enabled) {
      preferences.sound = enabled;
      persist();
    },
    setLoadout(moves, hotkeys) {
      preferences.loadout = [...moves];
      if (hotkeys) {
        preferences.hotkeys = [...hotkeys];
      }
      persist();
    },
    setMove(slot, name) {
      preferences.loadout[slot] = name;
      persist();
    },
    setHotkeys(hotkeys) {
      preferences.hotkeys = [...hotkeys];
      persist();
    },
    /** Bind a built-in action; a move slot or other built-in on that key is unbound. */
    setBuiltinHotkey(action, code) {
      if (!Object.hasOwn(DEFAULT_BUILTIN_HOTKEYS, action)) return;
      preferences.hotkeys = preferences.hotkeys.map((key) => (code && key === code ? '' : key));
      preferences.builtinHotkeys = Object.fromEntries(
        Object.entries(preferences.builtinHotkeys).map(([name, key]) => [
          name,
          name === action ? code : code && key === code ? '' : key,
        ]),
      );
      persist();
    },
    resetHotkeys() {
      preferences.hotkeys = [...DEFAULT_HOTKEYS];
      preferences.builtinHotkeys = { ...DEFAULT_BUILTIN_HOTKEYS };
      persist();
    },
    setHandicap(value) {
      preferences.handicapPercent = normalizeHandicapPercent(value);
      persist();
      return preferences.handicapPercent;
    },
    setTeam(team) {
      preferences.preferredTeam = team;
      persist();
    },
    setName(name) {
      profile.name = name.trim() || profile.name;
      preferences.profile = { ...profile };
      persist();
    },
    changeProfile(next) {
      const { room, id } = context();
      if (room?.settings.teamBattle) {
        const team = room.players.find((p) => p.id === id)?.team;
        preferences.teamColors[team] = next.secondaryColor;
        profile = { ...profile, name: next.name, look: next.look };
        send('teamAccent', { team, color: next.secondaryColor });
      } else profile = { ...next };
      preferences.profile = { ...profile };
      persist();
      clearTimeout(profileSyncTimer);
      const code = room?.code;
      if (code)
        profileSyncTimer = setTimeout(() => {
          if (context().room?.code === code) send('profile', { ...profile });
        }, 160);
    },
    rememberRules(value) {
      rememberRoomRules = value;
    },
    receiveRoom() {
      const { room, id } = context();
      if (!room || !rememberRoomRules || room.hostId !== id) return;
      const saved = normalizeRoomSettings(room.settings);
      if (JSON.stringify(saved) !== JSON.stringify(roomSettings)) {
        roomSettings = saved;
        saveRoomSettings(saved, storage);
      }
    },
    dispose() {
      clearTimeout(profileSyncTimer);
    },
  };
}
