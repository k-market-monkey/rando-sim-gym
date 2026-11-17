// The lobby's room rules form, built from the settings table.
import { ROOM_SETTINGS, ROOM_SETTING } from '../shared/protocol/room-settings.js';

const attr = (on, name) => (on ? ' ' + name : '');

function control(row, s, host, custom) {
  const id = 'setting-' + (row.id || row.key),
    locked = attr(!host || (row.key === 'teamBattle' && s.mode === 'ctf'), 'disabled'),
    wide = row.wide ? ' wide' : '';
  if (row.control === 'select') {
    const max = row.max?.(s) ?? Infinity;
    const options = row.values
      .filter((v) => v <= max || typeof v !== 'number')
      .map(
        (v) =>
          `<option value="${v}"${attr(v === s[row.key], 'selected')}${attr(v === 'ctf' && s.mechanicsVersion !== 'composed', 'disabled')}>${row.format(v)}</option>`,
      )
      .join('');
    return `<div class="field${wide}"><label for="${id}">${row.label}</label><select id="${id}" data-setting="${row.key}"${locked}>${options}</select>${row.help ? `<p class="helper">${row.help}</p>` : ''}</div>`;
  }
  if (row.control === 'checkbox')
    return `<div class="field wide"><label class="access-checkbox"><input type="checkbox" id="${id}" data-setting="${row.key}"${attr(s[row.key], 'checked')}${locked}> ${row.label}</label></div>`;
  if (row.control === 'number')
    return `<div class="field${wide}"><label for="${id}">${row.label}</label><input id="${id}" data-setting="${row.key}" type="number" min="${row.range[0]}" max="${row.range[1]}" step="1" value="${s[row.key] ?? row.default}"${locked}></div>`;
  return custom[row.control]?.(row) ?? '';
}

/**
 * The rules grid. `custom` renders controls that need content: `features`
 * and `map`, each given the row. Advanced rows sit in a section that stays
 * collapsed unless `advancedOpen`. Rows whose ruleset ignores them are left out.
 */
export function roomSettingsFormMarkup(settings, { host, custom = {}, advancedOpen = false }) {
  const rows = (advanced) =>
    ROOM_SETTINGS.filter(
      (row) => (row.group === 'advanced') === advanced && (row.applies?.(settings) ?? true),
    )
      .map((row) => control(row, settings, host, custom))
      .join('');
  const advanced = rows(true);
  const rules =
    settings.mechanicsVersion === 'composed'
      ? `Bots: ${(settings.botDifficulty || 'normal')[0].toUpperCase() + (settings.botDifficulty || 'normal').slice(1)}`
      : 'Classic uses Most kills instead of Capture the flag.';
  const objective =
    settings.mode === 'ctf'
      ? '<p class="helper ctf-rules">Capture the flag uses teams and a supported map. First to 3 captures; most captures at the time limit wins. Equal captures are a draw. Your flag must be home to capture.</p>'
      : '';
  return `<p class="helper gameplay-rules">${rules}</p><p class="helper exclusive-moves-rules">Exclusive moves: first to lock a move keeps it until they change it, spectate or leave. Disconnecting keeps picks. When enabled with duplicate picks, humans take priority, then room order. Applies to next-round loadouts; replay uses the previous round’s rules.</p>${objective}<div class="settings-grid">${rows(false)}${advanced ? `<details class="field wide advanced-settings"${attr(advancedOpen, 'open')}><summary>ADVANCED</summary><div class="settings-grid">${advanced}</div></details>` : ''}</div>`;
}

/** The value a changed `[data-setting]` element submits. */
export function settingValue(element) {
  if (element.type === 'checkbox') return element.checked;
  return ROOM_SETTING[element.dataset.setting]?.kind === 'integer'
    ? Number(element.value)
    : element.value;
}

/** Display names by value for an enum row, such as game modes. */
export const settingLabels = (key) =>
  Object.fromEntries(ROOM_SETTING[key].values.map((v) => [v, ROOM_SETTING[key].format(v)]));
