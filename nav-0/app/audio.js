import { playSynthSound, playCombatSounds } from './sound-effects.js';

/** One owner for the audio context and preference; shared by game and replay pages. */
export function createAudio({ enabled = true, persist = () => {} } = {}) {
  let muted = !enabled,
    audioCtx = null,
    toggle = null;
  function ensure() {
    if (muted) return;
    try {
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume();
    } catch {}
  }
  function sound(spec, volume = 0.045) {
    if (!muted && audioCtx) playSynthSound(audioCtx, spec, volume);
  }
  function refreshToggle() {
    if (!toggle) return;
    toggle.classList.toggle('sound-enabled', !muted);
    toggle.setAttribute('aria-pressed', String(!muted));
    toggle.innerHTML = `♫ <span>${muted ? 'OFF' : 'ON'}</span>`;
    toggle.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
  }
  return {
    ensure,
    sound,
    get enabled() {
      return !muted;
    },
    playState(state, previous, id) {
      if (!muted && audioCtx && state) playCombatSounds(audioCtx, state, previous, { localId: id });
    },
    mountToggle(element) {
      if (toggle) toggle.onclick = null;
      toggle = element;
      refreshToggle();
      toggle.onclick = () => {
        muted = !muted;
        persist(!muted);
        refreshToggle();
        ensure();
        if (!muted) sound({ wave: 'triangle', frequency: 580, slide: 220, duration: 150 });
      };
    },
    dispose() {
      if (toggle) toggle.onclick = null;
      toggle = null;
      audioCtx?.close();
      audioCtx = null;
    },
  };
}
