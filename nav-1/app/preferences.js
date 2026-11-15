import {
  DEFAULT_PROFILE,
  sanitizeProfile,
  generateDefaultName,
} from '../shared/content/characters.js';
import { normalizeHandicapPercent } from '../shared/sim/health.js';
import { TEAMS, normalizeTeam, normalizeTeamAccent } from '../shared/sim/teams.js';
import {
  normalizeMechanicsVersion,
  MECHANICS_VERSIONS,
  DEFAULT_MECHANICS_VERSION,
  LEGACY_MECHANICS_VERSION,
} from '../shared/protocol/versions.js';
import { MOUSE_BUTTON_CODES, mouseButtonLabel } from './mouse-controls.js';
import { currentMoveName } from './move-name-migrations.js';
export const PREFERENCES_KEY = 'rando.preferences.v1';
export const DEFAULT_HOTKEYS = ['KeyQ', 'KeyE', 'KeyR', '', ''];
// Every built-in action needs its own key; a loadout cannot ready without them.
export const BUILTIN_ACTIONS = ['dash', 'shield', 'shoot', 'swipe'];
export const DEFAULT_BUILTIN_HOTKEYS = Object.freeze({
  dash: 'Space',
  shield: 'ShiftLeft',
  shoot: 'Mouse0',
  swipe: 'KeyC',
});
export const BUILTIN_LABELS = { dash: 'Dash', shield: 'Shield', shoot: 'Shoot', swipe: 'Swipe' };
/** Classic has no shoot or swipe; Composed uses all four built-ins. */
export function builtinActionsFor(mechanicsVersion) {
  return mechanicsVersion === 'classic' ? ['dash', 'shield'] : BUILTIN_ACTIONS;
}
const HOTKEY_LABELS = {
  '': 'NONE',
  Space: 'SPACE',
  ShiftLeft: 'L SHIFT',
  ShiftRight: 'R SHIFT',
  ...Object.fromEntries(MOUSE_BUTTON_CODES.map((code, button) => [code, mouseButtonLabel(button)])),
  ...Object.fromEntries('QERTYUIOPFGHJKLZXCVBNM'.split('').map((key) => ['Key' + key, key])),
  ...Object.fromEntries('06789'.split('').map((key) => ['Digit' + key, key])),
  Tab: 'TAB',
  Enter: 'ENTER',
  Home: 'HOME',
  End: 'END',
  PageUp: 'PGUP',
  PageDown: 'PGDN',
  Insert: 'INS',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ...Object.fromEntries('0123456789'.split('').map((key) => ['Numpad' + key, 'NUM ' + key])),
  NumpadDecimal: 'NUM .',
  NumpadAdd: 'NUM +',
  NumpadSubtract: 'NUM -',
  NumpadMultiply: 'NUM *',
  NumpadDivide: 'NUM /',
  NumpadEnter: 'NUM ↵',
};
export const HOTKEY_OPTIONS = Object.keys(HOTKEY_LABELS);
// A move slot displaced by a migrated built-in moves to the first free key here.
const SLOT_FALLBACK_KEYS = ['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG', 'KeyX', 'KeyZ', 'KeyV'];
/**
 * Keys are unique across move slots and built-ins. Records saved before
 * built-ins were rebindable keep their move keys, except a slot on the new
 * shoot click, which moves to a free key; swipe keeps the old melee key.
 */
function normalizeHotkeys(raw) {
  const valid = (code) => typeof code === 'string' && HOTKEY_OPTIONS.includes(code);
  const migrating = !raw.builtinHotkeys || typeof raw.builtinHotkeys !== 'object';
  const builtinCandidates = migrating
    ? {
        ...DEFAULT_BUILTIN_HOTKEYS,
        ...(valid(raw.meleeHotkey) && raw.meleeHotkey ? { swipe: raw.meleeHotkey } : {}),
      }
    : Object.fromEntries(
        BUILTIN_ACTIONS.map((action) => [
          action,
          Object.hasOwn(raw.builtinHotkeys, action)
            ? raw.builtinHotkeys[action]
            : DEFAULT_BUILTIN_HOTKEYS[action],
        ]),
      );
  const used = new Set();
  const hotkeys = Array.from({ length: 5 }, (_, i) => {
    const candidate = Array.isArray(raw.hotkeys) ? raw.hotkeys[i] : DEFAULT_HOTKEYS[i];
    const code = valid(candidate) ? candidate : '';
    if (code && used.has(code)) return '';
    if (code) used.add(code);
    return code;
  });
  if (migrating) {
    const shoot = hotkeys.indexOf(DEFAULT_BUILTIN_HOTKEYS.shoot);
    if (shoot >= 0) {
      used.delete(hotkeys[shoot]);
      const reserved = new Set([...used, ...Object.values(builtinCandidates)]);
      hotkeys[shoot] = SLOT_FALLBACK_KEYS.find((code) => !reserved.has(code)) || '';
      if (hotkeys[shoot]) used.add(hotkeys[shoot]);
    }
  }
  const builtinHotkeys = {};
  for (const action of BUILTIN_ACTIONS) {
    const candidate = builtinCandidates[action];
    const code = valid(candidate) && !used.has(candidate) ? candidate : '';
    if (code) used.add(code);
    builtinHotkeys[action] = code;
  }
  return { hotkeys, builtinHotkeys };
}
/** Built-in actions, in order, that have no key for this edition. */
export function missingBuiltinHotkeys(preferences, mechanicsVersion) {
  return builtinActionsFor(mechanicsVersion).filter(
    (action) => !preferences.builtinHotkeys?.[action],
  );
}
export function hotkeyLabel(code) {
  return Object.hasOwn(HOTKEY_LABELS, code) ? HOTKEY_LABELS[code] : 'NONE';
}
export function normalizePreferences(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  // A record with a top-level loadout but no edition was saved before editions
  // existed, so its loadout is Classic. Anyone else starts in the default edition.
  const activeMechanicsVersion = normalizeMechanicsVersion(
    raw.activeMechanicsVersion,
    Array.isArray(raw.loadout) ? LEGACY_MECHANICS_VERSION : DEFAULT_MECHANICS_VERSION,
  );
  const normalizeLoadout = (values) =>
    Array.from({ length: 5 }, (_, i) =>
      typeof values?.[i] === 'string' && /^[a-z0-9 ]{0,14}$/.test(values[i]) ? values[i] : '',
    );
  // A record written before the two Composed editions were merged keeps a loadout
  // under each old ID. The engine takes the one that was in use, else the newest
  // edition's, skipping empty ones. Every name in them is in the merged library.
  const savedLoadout = (engine) => {
    if (engine.id === activeMechanicsVersion && Array.isArray(raw.loadout)) return raw.loadout;
    const saved = raw.loadoutsByVersion || {};
    if (Array.isArray(saved[engine.id])) return saved[engine.id];
    return [raw.activeMechanicsVersion, ...[...engine.aliases].reverse()]
      .filter((id) => engine.aliases.includes(id))
      .map((id) => saved[id])
      .find((loadout) => Array.isArray(loadout) && loadout.some(Boolean));
  };
  const loadoutsByVersion = Object.fromEntries(
    MECHANICS_VERSIONS.map((engine) => [
      engine.id,
      normalizeLoadout(savedLoadout(engine)).map((name) => currentMoveName(name, engine.id)),
    ]),
  );
  const { hotkeys, builtinHotkeys } = normalizeHotkeys(raw);
  return {
    version: 1,
    handicapPercent: normalizeHandicapPercent(raw.handicapPercent),
    sound: raw.sound === true,
    profile: sanitizeProfile(raw.profile || DEFAULT_PROFILE),
    preferredTeam: normalizeTeam(raw.preferredTeam),
    teamColors: Object.fromEntries(
      TEAMS.map((team) => [team.id, normalizeTeamAccent(raw.teamColors?.[team.id], team.id)]),
    ),
    activeMechanicsVersion,
    loadoutsByVersion,
    loadout: loadoutsByVersion[activeMechanicsVersion],
    hotkeys,
    builtinHotkeys,
  };
}
export function loadPreferences(storage) {
  let raw = {},
    savedPreferences = false;
  try {
    storage ??= globalThis.localStorage;
    const saved = storage.getItem(PREFERENCES_KEY);
    if (saved) {
      raw = JSON.parse(saved);
      savedPreferences = true;
    } else {
      const legacy = storage.getItem('rando.profile');
      if (legacy) raw = { profile: JSON.parse(legacy) };
    }
  } catch {}
  // Existing v1 records keep their saved sound choice (including omitted/false).
  // Only people without a saved preference record start with sound enabled.
  if (!savedPreferences) raw = { ...raw, sound: true };
  const preferences = normalizePreferences(raw);
  const originalName = raw?.profile?.name;
  if (!originalName || (!savedPreferences && ['Player one', 'PLAYER'].includes(originalName)))
    preferences.profile.name = generateDefaultName(Math.random);
  savePreferences(preferences, storage);
  return preferences;
}
export function savePreferences(preferences, storage) {
  try {
    storage ??= globalThis.localStorage;
    const previous = storage.getItem(PREFERENCES_KEY);
    storage.setItem(PREFERENCES_KEY, JSON.stringify(normalizePreferences(preferences)));
    if (storage === globalThis.localStorage && previous !== storage.getItem(PREFERENCES_KEY))
      globalThis.window?.dispatchEvent(new Event('preferences-changed'));
    return true;
  } catch {
    return false;
  }
}
export function matchHotkeys(originalNames, hotkeys) {
  return Object.fromEntries(
    originalNames.map((name, i) => [name, hotkeys[i] || '']).filter(([name]) => name),
  );
}
