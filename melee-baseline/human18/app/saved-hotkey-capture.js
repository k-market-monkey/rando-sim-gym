import { HOTKEY_OPTIONS, hotkeyLabel } from './preferences.js';
import { mouseButtonCode } from './mouse-controls.js';

// Isolated editor controls: never touch live-round bindings or player prefs.
export function bindSavedHotkeys(root, { getKeys, onChange, notify }) {
  let slot = null;
  const held = new Set(),
    clicks = new Set(),
    listeners = [];
  const buttons = () => root.querySelectorAll('[data-saved-hotkey]');
  function refresh() {
    for (const button of buttons()) {
      const index = Number(button.dataset.savedHotkey),
        listening = index === slot,
        label = hotkeyLabel(getKeys()[index]);
      button.textContent = listening ? '…' : label;
      button.classList.toggle('listening', listening);
      button.setAttribute('aria-pressed', String(listening));
      button.setAttribute(
        'aria-label',
        listening
          ? `Press a key for saved move ${index + 1}`
          : `Change saved move ${index + 1} hotkey, current ${label}`,
      );
    }
    const help = root.querySelector('#saved-key-help');
    if (help)
      help.textContent =
        slot === null
          ? 'Click a key, then press a key or mouse button.'
          : 'Press a key or mouse button. Backspace clears; Esc cancels.';
  }
  function stop() {
    slot = null;
    refresh();
  }
  function assign(code) {
    const index = slot;
    if (index === null) return;
    onChange(getKeys().map((key, i) => (i === index ? code : code && key === code ? '' : key)));
    stop();
  }
  function listen(target, event, callback, capture = false) {
    target.addEventListener(event, callback, capture);
    listeners.push(() => target.removeEventListener(event, callback, capture));
  }
  for (const button of buttons())
    button.onclick = () => {
      slot = Number(button.dataset.savedHotkey);
      refresh();
      button.focus();
    };
  listen(
    document,
    'keydown',
    (event) => {
      if (slot === null) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        stop();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') {
        stop();
        return;
      }
      const code = ['Backspace', 'Delete'].includes(event.code) ? '' : event.code;
      if (!HOTKEY_OPTIONS.includes(code)) {
        notify('That key is reserved. Try a letter, punctuation, Tab or another mouse button.');
        return;
      }
      assign(code);
    },
    true,
  );
  function down(event) {
    if (event.type === 'pointerdown' && event.pointerType && event.pointerType !== 'mouse') return;
    if (held.has(event.button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (slot === null) {
      clicks.delete(event.button);
      return;
    }
    const code = mouseButtonCode(event.button);
    if (!code) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    held.add(event.button);
    clicks.add(event.button);
    assign(code);
  }
  for (const event of ['pointerdown', 'mousedown']) listen(document, event, down, true);
  for (const event of ['pointerup', 'mouseup'])
    listen(
      window,
      event,
      (event) => {
        if (held.delete(event.button)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  for (const event of ['click', 'auxclick', 'contextmenu'])
    listen(
      document,
      event,
      (event) => {
        if (held.has(event.button) || clicks.has(event.button)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.type !== 'contextmenu') clicks.delete(event.button);
        }
      },
      true,
    );
  listen(root, 'focusin', (event) => {
    if (slot !== null && event.target !== root.querySelector(`[data-saved-hotkey="${slot}"]`))
      stop();
  });
  listen(window, 'blur', () => {
    held.clear();
    clicks.clear();
    stop();
  });
  refresh();
  return {
    destroy() {
      for (const remove of listeners) remove();
      held.clear();
      clicks.clear();
      slot = null;
    },
  };
}
