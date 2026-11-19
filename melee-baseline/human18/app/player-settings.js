// Display settings kept per browser. They change only what this browser draws,
// never the match itself.
export const PLAYER_SETTINGS_KEY = 'rando.playerSettings.v1';
export const ENEMY_COLORS = Object.freeze([
  Object.freeze({ id: 'red', label: 'Red', color: '#ef5555' }),
  Object.freeze({ id: 'orange', label: 'Orange', color: '#f29a3f' }),
  Object.freeze({ id: 'magenta', label: 'Magenta', color: '#e25bd8' }),
  Object.freeze({ id: 'white', label: 'White', color: '#f2f2ea' }),
  Object.freeze({ id: 'off', label: 'Their own colours', color: null }),
]);
export const DEFAULT_PLAYER_SETTINGS = Object.freeze({ enemyColor: 'red', combatStreamOpen: true });

export function normalizePlayerSettings(raw) {
  const enemyColor = ENEMY_COLORS.some((option) => option.id === raw?.enemyColor)
    ? raw.enemyColor
    : DEFAULT_PLAYER_SETTINGS.enemyColor;
  const combatStreamOpen =
    typeof raw?.combatStreamOpen === 'boolean'
      ? raw.combatStreamOpen
      : DEFAULT_PLAYER_SETTINGS.combatStreamOpen;
  return { enemyColor, combatStreamOpen };
}

export function loadPlayerSettings(storage = globalThis.localStorage) {
  try {
    return normalizePlayerSettings(JSON.parse(storage.getItem(PLAYER_SETTINGS_KEY)));
  } catch {
    return normalizePlayerSettings();
  }
}

export function savePlayerSettings(settings, storage = globalThis.localStorage) {
  const normalized = normalizePlayerSettings(settings);
  try {
    const previous = storage.getItem(PLAYER_SETTINGS_KEY);
    storage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(normalized));
    if (storage === globalThis.localStorage && previous !== storage.getItem(PLAYER_SETTINGS_KEY))
      globalThis.window?.dispatchEvent(new Event('preferences-changed'));
  } catch {
    // Private windows may refuse storage; the setting then lasts for this page.
  }
  return normalized;
}

let current = null;
export function playerSettings() {
  return (current ??= loadPlayerSettings());
}
export function updatePlayerSettings(changes) {
  return (current = savePlayerSettings({ ...playerSettings(), ...changes }));
}

/**
 * Returns the state to draw: in free for all, every player other than
 * `localId` takes the chosen enemy colour. Team games and spectators see the
 * state unchanged.
 */
export function withEnemyColors(state, localId, settings = playerSettings()) {
  const color = ENEMY_COLORS.find((option) => option.id === settings.enemyColor)?.color;
  if (!color || state.teamBattle || !state.players.some((p) => p.id === localId)) return state;
  return {
    ...state,
    players: state.players.map((p) => (p.id === localId ? p : { ...p, color })),
  };
}

export function playerSettingsMarkup(settings = playerSettings()) {
  const options = ENEMY_COLORS.map(
    (option) =>
      `<option value="${option.id}" ${option.id === settings.enemyColor ? 'selected' : ''}>${option.label}</option>`,
  ).join('');
  return `<div class="player-settings"><div class="section-head"><h2>Display</h2><span class="label">THIS BROWSER</span></div><div class="field"><label for="player-setting-enemyColor">ENEMY COLOUR (FREE FOR ALL)</label><select id="player-setting-enemyColor" data-player-setting="enemyColor">${options}</select></div></div>`;
}

/** Saves any `[data-player-setting]` control inside `root` when it changes. */
export function installPlayerSettings(root = document) {
  root.addEventListener('change', (event) => {
    const key = event.target?.dataset?.playerSetting;
    if (!key) return;
    updatePlayerSettings({ [key]: event.target.value });
  });
}
