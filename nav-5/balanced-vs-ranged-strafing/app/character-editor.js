import { NAME_LENGTH } from '/rando-sim-gym/nav-5/balanced-vs-ranged-strafing/shared/protocol/message-constants.js';
import { CHARACTER_LOOKS, sanitizeProfile } from '/rando-sim-gym/nav-5/balanced-vs-ranged-strafing/shared/content/characters.js';
import {
  normalizeTeam,
  resolveAppearance,
  teamAccentColor,
  teamAccentShade,
} from '/rando-sim-gym/nav-5/balanced-vs-ranged-strafing/shared/sim/teams.js';
import { drawAvatar } from './renderer.js';
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const fieldId = (prefix, id) => (prefix ? `${prefix}-${id}` : id);
const shadeLabel = (shade) =>
  shade < 0 ? `${Math.abs(shade)}% darker` : shade > 0 ? `${shade}% lighter` : 'Team color';
export function characterEditorMarkup(raw, { prefix = '', team = null } = {}) {
  team = normalizeTeam(team);
  const profile = resolveAppearance(sanitizeProfile(raw), team),
    id = (name) => fieldId(prefix, name),
    look = CHARACTER_LOOKS.find((look) => look.id === profile.look);
  const colorField = (property, key, label, value, disabled = false) =>
    `<div class="character-color-field"><label for="${id(key + '-color')}">${label}</label><div class="character-color-inputs"><input id="${id(key + '-color')}" type="color" value="${value}" data-character-color="${property}" aria-label="${label.toLowerCase()} color" ${disabled ? 'disabled' : ''}><input id="${id(key + '-hex')}" class="character-color-hex" data-character-hex="${property}" value="${value}" maxlength="7" pattern="#[0-9a-fA-F]{6}" spellcheck="false" autocomplete="off" aria-label="${label.toLowerCase()} color hex code" ${disabled ? 'disabled' : ''}></div></div>`;
  const shade = teamAccentShade(profile.secondaryColor, team);
  const secondary = team
    ? `<div class="character-color-field character-team-accent"><label for="${id('secondary-shade')}">SECONDARY SHADE</label><div class="character-shade-control"><span class="character-accent-swatch" data-team-swatch style="background:${profile.secondaryColor}" aria-hidden="true"></span><input id="${id('secondary-shade')}" data-team-shade type="range" min="-55" max="35" step="1" value="${shade}" aria-label="Secondary color shade" style="accent-color:${profile.color}"></div><output for="${id('secondary-shade')}" data-team-shade-value>${shadeLabel(shade)}</output></div>`
    : colorField('secondaryColor', 'secondary', 'SECONDARY', profile.secondaryColor);
  return `<section class="character-editor" data-character-editor="${esc(prefix)}"><div class="character-preview-wrap"><div class="character-preview" tabindex="0" role="group" aria-label="Character shape. Use left and right arrow keys to change shape."><canvas id="${id('profile-avatar')}" aria-label="Your character preview"></canvas><button type="button" class="character-arrow previous" data-character-step="-1" aria-label="Previous character shape">‹</button><button type="button" class="character-arrow next" data-character-step="1" aria-label="Next character shape">›</button></div><div class="character-look-name" aria-live="polite">${esc(look.label)} <span>${CHARACTER_LOOKS.findIndex((l) => l.id === look.id) + 1} / ${CHARACTER_LOOKS.length}</span></div></div><div class="character-fields"><div class="field"><label for="${id('player-name')}">YOUR NAME</label><input id="${id('player-name')}" data-character-name maxlength="${NAME_LENGTH}" value="${esc(profile.name)}" autocomplete="nickname"></div><div class="character-colors">${colorField('color', 'primary', 'PRIMARY', profile.color, !!team)}${secondary}</div>${team ? '<p class="helper character-help">Team color is fixed. Adjust your secondary shade.</p>' : ''}</div></section>`;
}
export function bindCharacterEditor(container, raw, onChange, { prefix = '', team = null } = {}) {
  const editor = [...container.querySelectorAll('[data-character-editor]')].find(
    (el) => el.dataset.characterEditor === prefix,
  );
  if (!editor) return;
  team = normalizeTeam(team);
  let profile = resolveAppearance(sanitizeProfile(raw), team);
  const canvas = editor.querySelector('canvas'),
    preview = editor.querySelector('.character-preview'),
    label = editor.querySelector('.character-look-name');
  const paint = () => {
    drawAvatar(canvas, profile);
    const index = CHARACTER_LOOKS.findIndex((look) => look.id === profile.look);
    label.innerHTML = `${esc(CHARACTER_LOOKS[index].label)} <span>${index + 1} / ${CHARACTER_LOOKS.length}</span>`;
  };
  const publish = () => {
    profile = resolveAppearance(sanitizeProfile(profile), team);
    onChange?.({ ...profile });
  };
  const changeShape = (direction) => {
    const index = CHARACTER_LOOKS.findIndex((look) => look.id === profile.look);
    profile.look =
      CHARACTER_LOOKS[(index + direction + CHARACTER_LOOKS.length) % CHARACTER_LOOKS.length].id;
    paint();
    publish();
  };
  editor
    .querySelectorAll('[data-character-step]')
    .forEach(
      (button) => (button.onclick = () => changeShape(Number(button.dataset.characterStep))),
    );
  preview.onkeydown = (event) => {
    if (event.target !== preview || !['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    changeShape(event.code === 'ArrowLeft' ? -1 : 1);
  };
  const name = editor.querySelector('[data-character-name]');
  name.oninput = () => {
    profile.name = sanitizeProfile({ name: name.value }, profile).name;
    publish();
  };
  for (const color of editor.querySelectorAll('[data-character-color]')) {
    if (color.disabled) continue;
    const property = color.dataset.characterColor,
      hex = editor.querySelector(`[data-character-hex="${property}"]`);
    color.oninput = () => {
      profile[property] = color.value;
      hex.value = color.value;
      hex.setCustomValidity('');
      paint();
    };
    color.onchange = () => {
      profile[property] = color.value;
      hex.value = color.value;
      paint();
      publish();
    };
    hex.oninput = () => {
      const valid = /^#[0-9a-f]{6}$/i.test(hex.value);
      hex.setCustomValidity(valid ? '' : 'Use a six-digit hex color, such as #dcf76b.');
      if (valid) {
        profile[property] = hex.value.toLowerCase();
        color.value = profile[property];
        paint();
      }
    };
    hex.onchange = () => {
      if (!/^#[0-9a-f]{6}$/i.test(hex.value)) {
        hex.reportValidity();
        return;
      }
      profile[property] = hex.value.toLowerCase();
      hex.value = profile[property];
      paint();
      publish();
    };
  }
  const shade = editor.querySelector('[data-team-shade]');
  if (shade) {
    shade.oninput = () => {
      profile.secondaryColor = teamAccentColor(team, Number(shade.value));
      editor.querySelector('[data-team-swatch]').style.background = profile.secondaryColor;
      editor.querySelector('[data-team-shade-value]').textContent = shadeLabel(Number(shade.value));
      paint();
    };
    shade.onchange = () => {
      shade.oninput();
      publish();
    };
  }
  paint();
  return {
    get profile() {
      return { ...profile };
    },
  };
}
