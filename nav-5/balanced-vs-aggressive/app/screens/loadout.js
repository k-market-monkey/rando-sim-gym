import { LOADOUT_PRESETS } from '../loadout-presets.js';
import { toggleFavorite, sortedMoveSuggestions, writeCollection } from '../loadout-collection.js';
import { BUILTIN_LABELS, HOTKEY_OPTIONS, builtinActionsFor, hotkeyLabel } from '../preferences.js';
import { moveProgressText } from '../move-progress.js';

let root = null,
  context = null,
  autocompleteIndex = -1,
  capturingHotkey = null;
const $ = (selector) => root?.querySelector(selector);

export function mount(element, nextContext) {
  root = element;
  context = nextContext;
  if (context.store.room) bind();
}
export function unmount() {
  capturingHotkey = null;
}
export function libraryLoaded() {
  const { store, libraryClient, loadout } = context;
  const helper = $('#loadout-generation-note');
  if (helper)
    helper.textContent = libraryClient.snapshot().generationEnabled
      ? 'New moves generate automatically.'
      : 'Choose from this library; custom generation is currently unavailable.';
  loadout.libraryLoaded();
  if (store.view !== 'home') {
    loadout.sync();
    if ($('#loadout-fields')) feedback();
    const slot = document.activeElement?.dataset.loadoutSlot;
    if (slot !== undefined) renderSuggestions(Number(slot));
  }
}

export function markup() {
  const { store, profileClient, libraryClient, loadout, esc } = context;
  return `<div class="loadout-section"><div class="section-head loadout-heading"><h2>Your next loadout</h2><div class="loadout-heading-actions"><button type="button" id="manage-loadouts" class="button small subtle">SAVED LOADOUTS</button><button type="button" id="randomize-loadout" class="button small subtle" title="Fill every slot with random library moves">RANDOMIZE ↻</button></div></div><div id="recommended-loadouts" ${LOADOUT_PRESETS.some((preset) => preset.mechanicsVersion === loadout.edition()) ? '' : 'hidden'}>${recommendedLoadoutsMarkup()}</div><div id="loadout-fields">${Array.from({ length: store.room.settings.moves }, (_, i) => `<div class="loadout-row"><span class="loadout-number">${i + 1}</span><div class="move-entry"><label class="sr-only" for="loadout-${i}">Move ${i + 1}</label><div class="move-input-wrap"><input id="loadout-${i}" data-loadout-slot="${i}" value="${esc(loadout.draftNames()[i] || '')}" maxlength="14" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions-${i}" aria-describedby="move-status-${i}" placeholder="Name a move…"><button type="button" class="move-lock" data-lock-slot="${i}" data-generate-slot="${i}" aria-label="Lock in move ${i + 1}" title="Lock in move">✓</button><button type="button" class="move-favorite" data-favorite-slot="${i}" aria-keyshortcuts="Alt+F" aria-label="Favorite move ${i + 1}" aria-pressed="false" title="Favorite this move">☆</button></div><div id="suggestions-${i}" class="move-suggestions" role="listbox"></div><div class="move-status-line"><div class="move-entry-status" id="move-status-${i}" aria-live="polite"></div><a class="move-balance" data-balance-slot="${i}" target="_blank" rel="noopener" hidden>Balance tests ↗</a></div></div><div class="hotkey-field"><label class="sr-only" for="hotkey-${i}">Extra hotkey for move ${i + 1}</label><button type="button" id="hotkey-${i}" class="hotkey-button" data-hotkey-slot="${i}" aria-describedby="hotkey-help">${hotkeyLabel(profileClient.preferences.hotkeys[i])}</button></div></div>`).join('')}</div>${builtinControlsMarkup()}<div class="loadout-actions"><button type="button" id="reset-hotkeys" class="button small subtle">RESET KEYS ↻</button><span id="hotkey-help" class="hotkey-note" role="status">Click a key to change it. 1–5 always work.</span></div><p class="helper">Type a move, then click ✓, press Enter or Tab, or leave the field to lock it in. <span id="loadout-generation-note">${libraryClient.snapshot().generationEnabled ? 'New moves generate automatically.' : 'Choose from this library; custom generation is currently unavailable.'}</span> Your choices save on this browser. ★ saves favorites; Alt+F favorites the highlighted move.</p></div>`;
}

function builtinKeyText(action) {
  const code = context.profileClient.preferences.builtinHotkeys?.[action];
  return code ? hotkeyLabel(code) : 'SET KEY';
}

function builtinControlsMarkup() {
  const actions = builtinActionsFor(context.store.room.settings.mechanicsVersion);
  return `<div class="builtin-controls" role="group" aria-label="Built-in action keys"><span class="builtin-heading">BUILT-IN</span>${actions.map((action) => `<div class="builtin-control"><span class="builtin-label">${BUILTIN_LABELS[action]}</span><button type="button" id="hotkey-${action}" class="hotkey-button" data-builtin-hotkey="${action}" aria-describedby="hotkey-help">${builtinKeyText(action)}</button></div>`).join('')}</div>`;
}

export function feedback() {
  const { store, libraryClient, loadout, refreshReadyControl } = context;
  if (!store.room) return;
  for (let i = 0; i < store.room.settings.moves; i++) {
    const input = $('#loadout-' + i),
      status = $('#move-status-' + i),
      button = document.querySelector(`[data-lock-slot="${i}"]`);
    if (!input || !status || !button) continue;
    const name = loadout.draftNames()[i] || '',
      valid = /^[a-z0-9 ]{1,14}$/.test(name) && !!name.trim(),
      duplicate =
        !!name &&
        loadout
          .draftNames()
          .slice(0, store.room.settings.moves)
          .some((n, j) => j !== i && n === name);
    const editing = loadout.isEditing(i),
      off = loadout.turnedOff(name),
      holder = loadout.claimedBy(name),
      pending = !editing && !!libraryClient.pending(name),
      error = loadout.error(i)?.name === name ? loadout.error(i).message : '',
      locked =
        valid && !duplicate && !editing && !pending && !off && !holder && loadout.knownName(name);
    const balanceLink = $(`[data-balance-slot="${i}"]`);
    if (balanceLink) {
      balanceLink.hidden = loadout.edition() !== 'composed' || !loadout.knownName(name);
      balanceLink.href =
        '/balance.html?' + new URLSearchParams({ name, mechanicsVersion: 'composed' });
      balanceLink.title = `Watch balance tests for ${name}`;
    }
    const state = !name
      ? 'empty'
      : duplicate || off || holder || (!valid && !editing)
        ? 'invalid'
        : error
          ? 'error'
          : pending
            ? 'generating'
            : locked
              ? 'locked'
              : 'editing';
    input.closest('.loadout-row').dataset.state = state;
    input.setAttribute('aria-invalid', String(state === 'invalid' || state === 'error'));
    input.setAttribute('aria-busy', String(pending));
    status.classList.toggle('invalid', state === 'invalid' || state === 'error');
    status.textContent = !name
      ? 'Type a move name.'
      : duplicate
        ? 'Choose a different move for each slot.'
        : holder
          ? `Held by ${holder.name}. Choose another move or ask them to release it.`
          : off
            ? 'Needs a feature this room has turned off.'
            : state === 'invalid'
              ? 'Use 1–14 lowercase letters, digits and spaces.'
              : error
                ? error
                : pending
                  ? moveProgressText(libraryClient.pending(name)?.progress)
                  : locked
                    ? '✓ Locked in · Ready'
                    : 'Editing · Confirm with ✓ or leave the field.';
    button.disabled = !name || pending || locked || duplicate || off || !!holder;
    button.classList.toggle('loading', pending);
    button.textContent = pending ? '' : error ? '↻' : '✓';
    button.setAttribute(
      'aria-label',
      pending
        ? `Generating move ${i + 1}`
        : locked
          ? `Move ${i + 1} locked in`
          : error
            ? `Retry move ${i + 1}`
            : `Lock in move ${i + 1}`,
    );
    status.dataset.progressPhase = pending
      ? libraryClient.pending(name)?.progress?.phase || 'requesting'
      : '';
    button.title = pending
      ? moveProgressText(libraryClient.pending(name)?.progress)
      : locked
        ? 'Locked in'
        : error
          ? 'Retry generation'
          : 'Lock in move';
  }
  refreshFavorites();
  refreshReadyControl();
}

function suggestions(slot) {
  const { store, loadoutManager, loadout } = context;
  return sortedMoveSuggestions(
    loadout.roomLibrary().filter((move) => !loadout.claimedBy(move.name)),
    {
      query: loadout.draftNames()[slot] || '',
      favorites: loadoutManager.collection.favorites[loadout.edition()],
      excluded: loadout
        .draftNames()
        .slice(0, store.room.settings.moves)
        .filter((_, index) => index !== slot),
    },
  );
}

function renderSuggestions(slot) {
  const { loadoutManager, loadout, esc } = context;
  const el = $('#suggestions-' + slot),
    input = $('#loadout-' + slot);
  if (!el || !input) return;
  const matches = suggestions(slot),
    favorites = loadoutManager.collection.favorites[loadout.edition()] || [];
  el.innerHTML = matches
    .map(
      (move, index) =>
        `<div class="move-suggestion-row" role="presentation"><button type="button" role="option" aria-selected="${autocompleteIndex === index}" class="move-suggestion ${autocompleteIndex === index ? 'active' : ''}" data-suggest-slot="${slot}" data-suggest-name="${esc(move.name)}" id="suggestion-${slot}-${index}">${esc(move.name)}${favorites.includes(move.name) ? '<span class="sr-only">, favorite</span>' : ''}</button><button type="button" class="move-favorite" data-favorite-name="${esc(move.name)}" aria-label="${favorites.includes(move.name) ? 'Unfavorite' : 'Favorite'} ${esc(move.name)}" aria-pressed="${favorites.includes(move.name)}" title="${favorites.includes(move.name) ? 'Remove favorite' : 'Favorite move'}">${favorites.includes(move.name) ? '★' : '☆'}</button></div>`,
    )
    .join('');
  input.setAttribute('aria-expanded', String(matches.length > 0));
  if (autocompleteIndex >= 0 && matches[autocompleteIndex])
    input.setAttribute('aria-activedescendant', `suggestion-${slot}-${autocompleteIndex}`);
  else input.removeAttribute('aria-activedescendant');
  el.querySelectorAll('button').forEach(
    (button) => (button.onmousedown = (e) => e.preventDefault()),
  );
  el.querySelectorAll('[data-suggest-name]').forEach(
    (button) => (button.onclick = () => selectMove(slot, button.dataset.suggestName)),
  );
  el.querySelectorAll('[data-favorite-name]').forEach(
    (button) =>
      (button.onclick = () => {
        favoriteMove(button.dataset.favoriteName);
        renderSuggestions(slot);
      }),
  );
}

function favoriteMove(name) {
  const { libraryClient, loadoutManager, loadout, toast } = context;
  if (!libraryClient.snapshot().moves.some((move) => move.name === name)) return;
  try {
    toggleFavorite(loadoutManager.collection, loadout.edition(), name);
    if (!writeCollection(loadoutManager.collection))
      toast('Favorites will last this session; browser storage is unavailable.');
    refreshFavorites();
    const slot = document.activeElement?.dataset.loadoutSlot;
    if (slot !== undefined) renderSuggestions(Number(slot));
  } catch (error) {
    toast(error.message);
  }
}

export function refreshFavorites() {
  const { libraryClient, loadoutManager, loadout } = context;
  for (const button of document.querySelectorAll('[data-favorite-slot]')) {
    const name = loadout.draftNames()[Number(button.dataset.favoriteSlot)],
      known = libraryClient.snapshot().moves.some((move) => move.name === name),
      favorite = (loadoutManager.collection.favorites[loadout.edition()] || []).includes(name);
    button.disabled = !known;
    button.textContent = favorite ? '★' : '☆';
    button.setAttribute('aria-pressed', String(favorite));
    button.setAttribute(
      'aria-label',
      known
        ? `${favorite ? 'Unfavorite' : 'Favorite'} ${name}`
        : 'Choose a library move to favorite',
    );
    button.title = known
      ? favorite
        ? 'Remove favorite'
        : 'Favorite this move'
      : 'Choose a library move to favorite';
  }
}

export function closeSuggestions(slot) {
  const el = $('#suggestions-' + slot);
  if (el) el.replaceChildren();
  const input = $('#loadout-' + slot);
  input?.setAttribute('aria-expanded', 'false');
  input?.removeAttribute('aria-activedescendant');
}

export function selectMove(slot, name) {
  const { store, loadout, toast } = context;
  if (
    loadout
      .draftNames()
      .slice(0, store.room.settings.moves)
      .some((n, i) => i !== slot && n === name)
  ) {
    toast('That move is already in your loadout.');
    return;
  }
  loadout.changeDraft(slot, name);
  const input = $('#loadout-' + slot);
  if (input) {
    input.value = name;
    input.focus();
  }
  closeSuggestions(slot);
  loadout.lockMove(slot);
}

function recommendedLoadoutsMarkup() {
  const { store, connection, libraryClient, loadout, esc, member } = context;
  if (!store.room) return '';
  return LOADOUT_PRESETS.filter((preset) => preset.mechanicsVersion === loadout.edition())
    .map((preset) => {
      const count = store.room.settings.moves,
        size = preset.names.length,
        statusId = 'preset-status-' + preset.id,
        needed = preset.names.slice(0, count),
        held = needed.filter((name) => loadout.claimedBy(name)),
        missing = needed.filter(
          (name) => !loadout.roomLibrary().some((move) => move.name === name),
        );
      const disabled =
        !connection.ready ||
        libraryClient.snapshot().status !== 'ready' ||
        missing.length > 0 ||
        held.length > 0;
      const selected = needed.every(
        (name, slot) =>
          member()?.loadout[slot] === name &&
          loadout.draftNames()[slot] === name &&
          !loadout.isEditing(slot),
      );
      const countNote =
        count < size
          ? `This room has ${count} ${count === 1 ? 'slot' : 'slots'}; uses the first ${count === 1 ? 'move' : count + ' moves'}.`
          : count > size
            ? `Fills slots 1–${size}. Extra slots stay editable.`
            : `Fills all ${size} move slots.`;
      const status = !connection.ready
        ? 'Reconnect to choose this loadout.'
        : libraryClient.snapshot().status === 'error'
          ? 'Retry the move library to use this loadout.'
          : libraryClient.snapshot().status !== 'ready'
            ? 'Loading the move library…'
            : held.length
              ? `Held by other fighters: ${held.join(', ')}. Choose another loadout.`
              : missing.length
                ? `Not available in this library: ${missing.join(', ')}.`
                : (selected ? 'Selected. ' : '') + countNote;
      return `<article class="loadout-preset" aria-label="${esc(preset.label)} recommended loadout"><div class="preset-heading"><div><span class="label">RECOMMENDED LOADOUT</span><h3>${esc(preset.label)}</h3></div><button type="button" class="button small subtle" data-loadout-preset="${esc(preset.id)}" aria-describedby="${esc(statusId)}" ${disabled ? 'disabled' : ''}>USE LOADOUT →</button></div><ol class="preset-moves">${preset.names.map((name, slot) => `<li class="${slot < count ? '' : 'preset-unused'}">${esc(name)}</li>`).join('')}</ol><p class="helper" id="${esc(statusId)}" role="status">${esc(status)}</p></article>`;
    })
    .join('');
}

export function refreshRecommendedLoadouts() {
  const root = $('#recommended-loadouts');
  if (!root) return;
  const markup = recommendedLoadoutsMarkup();
  root.hidden = !markup;
  if (root.presetMarkup !== markup) {
    root.innerHTML = markup;
    root.presetMarkup = markup;
  }
}

export function refreshHotkeys() {
  const { profileClient } = context;
  document.querySelectorAll('[data-hotkey-slot]').forEach((button) => {
    const slot = Number(button.dataset.hotkeySlot),
      listening = capturingHotkey === slot,
      key = hotkeyLabel(profileClient.preferences.hotkeys[slot]);
    button.textContent = listening ? '…' : key;
    button.classList.toggle('listening', listening);
    button.setAttribute('aria-pressed', String(listening));
    button.setAttribute(
      'aria-label',
      listening
        ? `Press a key for move ${slot + 1}`
        : `Change hotkey for move ${slot + 1}, current ${key}`,
    );
    button.title = listening
      ? 'Press a key or mouse button'
      : 'Click, then press a key or mouse button';
  });
  document.querySelectorAll('[data-builtin-hotkey]').forEach((button) => {
    const action = button.dataset.builtinHotkey,
      listening = capturingHotkey === action,
      code = profileClient.preferences.builtinHotkeys?.[action],
      name = BUILTIN_LABELS[action].toLowerCase();
    button.textContent = listening ? '…' : builtinKeyText(action);
    button.classList.toggle('listening', listening);
    button.classList.toggle('missing', !code);
    button.setAttribute('aria-pressed', String(listening));
    button.setAttribute(
      'aria-label',
      listening
        ? `Press a key for ${name}`
        : `Change ${name} hotkey, current ${code ? hotkeyLabel(code) : 'none'}`,
    );
  });
  // The lobby's built-in move summary shows the same keys.
  document.querySelectorAll('[data-builtin-kbd]').forEach((kbd) => {
    const code = profileClient.preferences.builtinHotkeys?.[kbd.dataset.builtinKbd];
    kbd.textContent = code ? hotkeyLabel(code) : 'NONE';
  });
  const help = $('#hotkey-help');
  if (help)
    help.textContent =
      capturingHotkey === null
        ? 'Click a key to change it. 1–5 always work.'
        : 'Press a key or mouse button. Backspace clears; Esc cancels.';
}

export function stopHotkeyCapture() {
  const { clearControls } = context;
  capturingHotkey = null;
  refreshHotkeys();
  clearControls();
}

function assignHotkey(code) {
  if (typeof capturingHotkey === 'number') {
    const done = context.loadout.setHotkey(capturingHotkey, code);
    context.refreshReadyControl();
    return done;
  }
  context.profileClient.setBuiltinHotkey(capturingHotkey, code);
  context.input.resetBindings();
  context.clearControls();
  context.updateHUD();
  context.refreshReadyControl();
  return true;
}

function bindHotkeyButtons() {
  const { store, loadout, clearControls } = context;
  if (typeof capturingHotkey === 'number' && capturingHotkey >= store.room.settings.moves)
    capturingHotkey = null;
  document.querySelectorAll('[data-hotkey-slot]').forEach(
    (button) =>
      (button.onclick = () => {
        const slot = Number(button.dataset.hotkeySlot);
        if (capturingHotkey === slot) {
          if (loadout.setHotkey(slot, 'Mouse0')) stopHotkeyCapture();
        } else {
          capturingHotkey = slot;
          clearControls();
          refreshHotkeys();
          button.focus();
        }
      }),
  );
  document.querySelectorAll('[data-builtin-hotkey]').forEach(
    (button) =>
      (button.onclick = () => {
        const action = button.dataset.builtinHotkey;
        if (capturingHotkey === action) {
          if (assignHotkey('Mouse0')) stopHotkeyCapture();
          return;
        }
        capturingHotkey = action;
        clearControls();
        refreshHotkeys();
        button.focus();
      }),
  );
  refreshHotkeys();
  if (capturingHotkey !== null) $('#hotkey-' + capturingHotkey)?.focus({ preventScroll: true });
}

function captureHotkey(e) {
  const { toast } = context;
  if (capturingHotkey === null) return false;
  if (!$('#hotkey-' + capturingHotkey)) {
    stopHotkeyCapture();
    return false;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) {
    stopHotkeyCapture();
    return false;
  }
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return true;
  if (e.code === 'Escape') {
    stopHotkeyCapture();
    return true;
  }
  const code = ['Backspace', 'Delete'].includes(e.code) ? '' : e.code;
  if (!HOTKEY_OPTIONS.includes(code)) {
    toast('That key is reserved. Try a letter, Space, Shift, punctuation, Tab or a numpad key.');
    return true;
  }
  if (assignHotkey(code)) stopHotkeyCapture();
  return true;
}

export function bind() {
  const {
    profileClient,
    loadoutManager,
    loadout,
    input,
    clearControls,
    updateHUD,
    renderEditor,
    editorState,
  } = context;
  const managerButton = $('#manage-loadouts');
  if (managerButton) {
    managerButton.onmousedown = (event) => event.preventDefault();
    managerButton.onclick = () => loadoutManager.open();
  }
  document.querySelectorAll('[data-favorite-slot]').forEach((button) => {
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = () => favoriteMove(loadout.draftNames()[Number(button.dataset.favoriteSlot)]);
  });
  $('#randomize-loadout')?.addEventListener('click', loadout.randomize);
  const presets = $('#recommended-loadouts');
  if (presets) {
    presets.onmousedown = (event) => {
      if (event.target.closest('[data-loadout-preset]')) event.preventDefault();
    };
    presets.onclick = (event) => {
      const button = event.target.closest('[data-loadout-preset]');
      if (button && !button.disabled) loadout.useRecommendedLoadout(button.dataset.loadoutPreset);
    };
  }
  document.querySelectorAll('[data-loadout-slot]').forEach((input) => {
    const slot = Number(input.dataset.loadoutSlot);
    input.oninput = () => {
      autocompleteIndex = -1;
      loadout.changeDraft(slot, input.value);
      renderSuggestions(slot);
    };
    input.onfocus = () => {
      clearControls();
      autocompleteIndex = -1;
      renderSuggestions(slot);
    };
    input.onblur = () => {
      setTimeout(() => {
        if (document.activeElement?.id !== 'loadout-' + slot) closeSuggestions(slot);
      }, 120);
      if (input.isConnected && !editorState.replacing) loadout.lockMove(slot);
    };
    input.onkeydown = (e) => {
      if (e.altKey && e.code === 'KeyF') {
        e.preventDefault();
        const name =
          autocompleteIndex >= 0
            ? suggestions(slot)[autocompleteIndex]?.name
            : loadout.draftNames()[slot];
        if (name) favoriteMove(name);
      } else if (['ArrowDown', 'ArrowUp'].includes(e.code)) {
        e.preventDefault();
        const matches = suggestions(slot);
        autocompleteIndex = matches.length
          ? autocompleteIndex < 0
            ? e.code === 'ArrowDown'
              ? 0
              : matches.length - 1
            : (autocompleteIndex + (e.code === 'ArrowDown' ? 1 : -1) + matches.length) %
              matches.length
          : -1;
        renderSuggestions(slot);
      } else if (e.code === 'Enter') {
        e.preventDefault();
        const matches = suggestions(slot),
          chosen =
            autocompleteIndex >= 0
              ? matches[autocompleteIndex]
              : matches.find((move) => move.name === (loadout.draftNames()[slot] || ''));
        if (chosen) selectMove(slot, chosen.name);
        else {
          closeSuggestions(slot);
          loadout.lockMove(slot, true);
        }
      } else if (e.code === 'Tab') {
        loadout.lockMove(slot);
        const next = $('#loadout-' + (slot + (e.shiftKey ? -1 : 1)));
        if (next) {
          e.preventDefault();
          next.focus();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        closeSuggestions(slot);
      }
    };
  });
  document.querySelectorAll('[data-lock-slot]').forEach((button) => {
    button.onmousedown = (e) => e.preventDefault();
    button.onclick = () => {
      const slot = Number(button.dataset.lockSlot);
      closeSuggestions(slot);
      loadout.lockMove(slot, true);
    };
  });
  bindHotkeyButtons();
  $('#reset-hotkeys')?.addEventListener('click', () => {
    stopHotkeyCapture();
    profileClient.resetHotkeys();
    input.resetBindings();
    clearControls();
    renderEditor();
    updateHUD();
    context.refreshReadyControl();
  });
  feedback();
}
export function resetAutocomplete() {
  autocompleteIndex = -1;
}
export function writeSlot(slot, name) {
  const input = $('#loadout-' + slot);
  if (input) input.value = name;
}
export const hotkeyCapture = {
  active: () => capturingHotkey !== null,
  keydown: captureHotkey,
  bindMouse: (code) => {
    if (assignHotkey(code)) stopHotkeyCapture();
  },
  cancel: stopHotkeyCapture,
  focusChanged: (event) => {
    if (capturingHotkey !== null && event.target !== $('#hotkey-' + capturingHotkey))
      stopHotkeyCapture();
  },
};
