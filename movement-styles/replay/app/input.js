import { WIDTH, HEIGHT } from '../shared/content/arena.js';
import { getEngineView } from './engine-view.js';
import { DEFAULT_BUILTIN_HOTKEYS, matchHotkeys } from './preferences.js';
import { mouseButtonCode, bindingHeld } from './mouse-controls.js';
import { emoteForKey } from './emote-sprites.js';

export function createInput({
  context,
  send,
  ensureAudio,
  hotkeyCapture,
  closeDock,
  document: doc = document,
  window: win = window,
}) {
  const keys = new Set(),
    mouseButtons = new Set(),
    capturedMouseButtons = new Set(),
    capturedMouseClicks = new Set(),
    aim = { x: WIDTH / 2, y: HEIGHT / 2 };
  let pendingDash = false,
    pendingEmote = 0,
    pressSequence = 0,
    pendingPresses = [],
    activeBindings = {},
    bindingRound = null,
    canvas = null,
    installed = false;
  const listeners = [];
  const $ = (selector) => doc.querySelector(selector);

  function clearControls() {
    const hadInput = keys.size || mouseButtons.size || pendingDash || pendingPresses.length;
    keys.clear();
    mouseButtons.clear();
    pendingDash = false;
    pendingEmote = 0;
    pendingPresses = [];
    const { room, open } = context();
    if (hadInput && room?.phase === 'playing' && open)
      send('input', {
        roundNumber: room.roundNumber,
        inputRevision: room.inputRevision || 0,
        input: { cancelAttacks: true },
      });
  }

  function captureRoundBindings() {
    const { room, id, hotkeys } = context();
    if (!room || room.phase === 'lobby') return;
    const key = room.code + ':' + room.roundNumber;
    if (key === bindingRound) return;
    bindingRound = key;
    const fighter = room.roundPlayers?.find((p) => p.id === id);
    activeBindings = matchHotkeys(fighter?.loadout || [], hotkeys);
  }
  function builtinKey(action) {
    return (context().builtinHotkeys ?? DEFAULT_BUILTIN_HOTKEYS)[action] || '';
  }
  function swipeKey() {
    return builtinKey('swipe');
  }
  /** Built-in action keys this round's engine reads. */
  function builtinBindings() {
    const state = context().state;
    return {
      dash: builtinKey('dash'),
      shield: builtinKey('shield'),
      ...(state?.shootEnabled === true ? { shoot: builtinKey('shoot') } : {}),
      ...(state?.swipeEnabled === true ? { swipe: swipeKey() } : {}),
    };
  }
  function pressBuiltin(code) {
    if (code && code === builtinKey('dash')) pendingDash = true;
  }
  function abilityKey(move) {
    return activeBindings[move.name] || '';
  }
  function updateBinding(name, code) {
    if (!Object.hasOwn(activeBindings, name)) return;
    if (code)
      for (const [activeName, binding] of Object.entries(activeBindings))
        if (activeName !== name && binding === code) activeBindings[activeName] = '';
    activeBindings[name] = code;
  }
  function resetBindings() {
    const { room, id, hotkeys } = context();
    const frozen = room.roundPlayers?.find((p) => p.id === id);
    if (frozen) activeBindings = matchHotkeys(frozen.loadout, hotkeys);
  }
  function resetPresses({ resuming = false } = {}) {
    pressSequence = 0;
    pendingPresses = [];
    if (resuming) bindingRound = null;
  }
  function acknowledge(sequence) {
    pressSequence = Math.max(pressSequence, sequence);
    pendingPresses = pendingPresses.filter((press) => press.seq > sequence);
  }

  function boundCombatMouse(event) {
    const { view, state, id, dockOpen } = context();
    const code = mouseButtonCode(event.button);
    return (
      !!code &&
      event.target?.closest?.('#game-canvas') &&
      view === 'match' &&
      !dockOpen &&
      !state?.ended &&
      state?.players.some(
        (p) =>
          p.id === id &&
          !p.dead &&
          (p.loadout.some((move) => abilityKey(move) === code) ||
            Object.values(builtinBindings()).includes(code)),
      )
    );
  }
  function mouseDown(event) {
    if (event.type === 'pointerdown' && event.pointerType && event.pointerType !== 'mouse') return;
    ensureAudio();
    if (capturedMouseButtons.has(event.button)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (hotkeyCapture.active()) {
      const code = mouseButtonCode(event.button);
      if (!code) return;
      event.preventDefault();
      event.stopPropagation();
      capturedMouseButtons.add(event.button);
      capturedMouseClicks.add(event.button);
      hotkeyCapture.bindMouse(code);
      return;
    }
    capturedMouseClicks.delete(event.button);
    if (event.type === 'pointerdown') return;
    if (!boundCombatMouse(event)) return;
    event.preventDefault();
    $('#game-canvas').focus();
    if (!combatEnabled()) return;
    if (!mouseButtons.has(event.button)) {
      mouseButtons.add(event.button);
      pressBuiltin(mouseButtonCode(event.button));
      recordPress(mouseButtonCode(event.button));
    }
  }
  function mouseUp(event) {
    const captured = capturedMouseButtons.delete(event.button),
      held = mouseButtons.delete(event.button);
    if (captured || held || boundCombatMouse(event)) {
      event.preventDefault();
      if (captured) event.stopPropagation();
    }
  }
  function cancelMouseControls() {
    hotkeyCapture.cancel();
    capturedMouseButtons.clear();
    capturedMouseClicks.clear();
  }
  function mouseClick(event) {
    const captured =
      capturedMouseButtons.has(event.button) || capturedMouseClicks.has(event.button);
    if (
      captured ||
      (hotkeyCapture.active() && event.type === 'contextmenu') ||
      boundCombatMouse(event)
    ) {
      event.preventDefault();
      if (captured) event.stopPropagation();
    }
    if (event.type !== 'contextmenu') capturedMouseClicks.delete(event.button);
  }

  function keyDown(e) {
    if (hotkeyCapture.keydown(e)) return;
    if ($('dialog[open]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      clearControls();
      return;
    }
    if (e.code === 'Escape' && context().dockOpen) {
      e.preventDefault();
      closeDock();
      return;
    }
    if (
      e.code === 'Escape' &&
      !e.defaultPrevented &&
      !e.repeat &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(doc.activeElement?.tagName) &&
      pauseAvailable()
    ) {
      e.preventDefault();
      togglePause();
      return;
    }
    if (!combatEnabled() || (e.repeat && !keys.has(e.code))) return;
    if (
      [
        // Space never scrolls the page during a match, even when unbound.
        'Space',
        ...Object.values(builtinBindings()).filter((code) => code && !code.startsWith('Mouse')),
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        ...Object.values(activeBindings).filter((code) => code && !code.startsWith('Mouse')),
        'Digit1',
        'Digit2',
        'Digit3',
        'Digit4',
        'Digit5',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(e.code)
    ) {
      e.preventDefault();
      keys.add(e.code);
      if (!e.repeat) recordPress(e.code);
      if (!e.repeat) pressBuiltin(e.code);
      ensureAudio();
      return;
    }
    const emote = emoteForKey(e.code, { ...activeBindings, ...builtinBindings() });
    if (emote) {
      e.preventDefault();
      keys.add(e.code);
      pendingEmote = emote;
    }
  }
  function pauseAvailable() {
    const { view, room, state, id } = context();
    return (
      view === 'match' &&
      room?.phase === 'playing' &&
      !state?.ended &&
      room.pauseControllerId === id
    );
  }
  function togglePause() {
    if (!pauseAvailable()) return;
    clearControls();
    const { room } = context();
    send('pause', { roundNumber: room.roundNumber, paused: !room.paused });
  }
  function combatEnabled() {
    const { view, state, room, id, dockOpen } = context();
    return (
      !hotkeyCapture.active() &&
      !$('dialog[open]') &&
      view === 'match' &&
      state &&
      !state.ended &&
      !room?.paused &&
      state.players.some((p) => p.id === id && !p.dead) &&
      !dockOpen &&
      !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(doc.activeElement?.tagName)
    );
  }
  function recordPress(code) {
    const { state, round, id } = context();
    if (!state || !getEngineView(round?.engine).pressQueue) return;
    const fighter = state.players.find((p) => p.id === id);
    if (!fighter) return;
    // Queued built-in presses; dash and shield are read directly.
    for (const action of ['shoot', 'swipe'])
      if (state[`${action}Enabled`] === true && code && code === builtinKey(action)) {
        if (pendingPresses.length < 16) pendingPresses.push({ action, seq: ++pressSequence });
        return;
      }
    const numeric = /^Digit[1-5]$/.test(code) ? Number(code.slice(-1)) - 1 : -1;
    const slot =
      numeric >= 0 ? numeric : fighter.loadout.findIndex((move) => abilityKey(move) === code);
    if (slot >= 0 && slot < fighter.loadout.length && pendingPresses.length < 16)
      pendingPresses.push({ slot, seq: ++pressSequence });
  }
  function currentInput() {
    if (!combatEnabled()) {
      clearControls();
      return {
        x: 0,
        y: 0,
        cast: -1,
        shield: false,
        dash: false,
        aimX: aim.x,
        aimY: aim.y,
        cancelAttacks: true,
      };
    }
    let cast = -1;
    const { state, id } = context();
    const heldSlots = [],
      fighter = state.players.find((p) => p.id === id);
    for (const [index, move] of fighter.loadout.entries()) {
      const key = abilityKey(move);
      if (bindingHeld(key, keys, mouseButtons) || keys.has('Digit' + (index + 1))) {
        cast = index;
        heldSlots.push(index);
      }
    }
    const input = {
      x:
        Number(keys.has('KeyD') || keys.has('ArrowRight')) -
        Number(keys.has('KeyA') || keys.has('ArrowLeft')),
      y:
        Number(keys.has('KeyS') || keys.has('ArrowDown')) -
        Number(keys.has('KeyW') || keys.has('ArrowUp')),
      aimX: aim.x,
      aimY: aim.y,
      dash: pendingDash,
      shield: bindingHeld(builtinKey('shield'), keys, mouseButtons),
      cast,
      heldSlots,
      presses: pendingPresses.map((press) => ({ ...press })),
    };
    if (pendingEmote) input.emote = pendingEmote;
    pendingDash = false;
    pendingEmote = 0;
    return input;
  }

  function mouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    // The renderer sizes the canvas to the round's arena.
    const width = canvas.width || WIDTH,
      height = canvas.height || HEIGHT,
      scale = Math.min(rect.width / width, rect.height / height),
      left = rect.left + (rect.width - width * scale) / 2,
      top = rect.top + (rect.height - height * scale) / 2;
    aim.x = Math.max(0, Math.min(width, (e.clientX - left) / scale));
    aim.y = Math.max(0, Math.min(height, (e.clientY - top) / scale));
  }
  function bindCanvas(next) {
    if (canvas) canvas.removeEventListener('mousemove', mouseMove);
    canvas = next;
    if (canvas) canvas.addEventListener('mousemove', mouseMove);
  }
  function listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  }
  function install() {
    if (installed) return;
    installed = true;
    // Capture bindings before native actions. Combat uses mouse events: cancelling
    // pointerdown would suppress the later mousedown events for a button chord.
    listen(doc, 'pointerdown', mouseDown, true);
    listen(doc, 'mousedown', mouseDown, true);
    listen(win, 'pointerup', mouseUp, true);
    listen(win, 'mouseup', mouseUp, true);
    for (const type of ['click', 'auxclick', 'contextmenu']) listen(doc, type, mouseClick, true);
    listen(win, 'keydown', keyDown);
    listen(win, 'keyup', (e) => keys.delete(e.code));
    listen(win, 'blur', cancelMouseControls);
    listen(win, 'pointercancel', cancelMouseControls);
    listen(doc, 'visibilitychange', () => {
      if (doc.hidden) cancelMouseControls();
    });
    listen(doc, 'focusin', (e) => {
      hotkeyCapture.focusChanged(e);
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) clearControls();
    });
  }
  function dispose() {
    for (const remove of listeners.splice(0)) remove();
    bindCanvas(null);
    cancelMouseControls();
    installed = false;
  }

  return {
    currentInput,
    clearControls,
    captureRoundBindings,
    abilityKey,
    builtinKey,
    swipeKey,
    updateBinding,
    resetBindings,
    resetPresses,
    acknowledge,
    togglePause,
    bindCanvas,
    install,
    dispose,
    get aim() {
      return { ...aim };
    },
  };
}
