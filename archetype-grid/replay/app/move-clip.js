import { applyTick } from '../shared/protocol/snapshot.js';
import { renderArena, receiveEffects } from './renderer.js';
import { arenaSize } from './arena-size.js';
import { clipView, easeView } from './move-clip-camera.js';
import { loadMoveClip } from './move-clip-loader.js';
import { useStylesheet } from './use-stylesheet.js';

// Standalone: no app, store or socket imports, so any page can embed a clip.
export const CLIP_TICK_RATE = 30;
const LOOP_PAUSE_MS = 900;

/** Display states with readable fighter names: the move's user and its opponent. */
export function clipFrames(clip, moveName = clip.move?.name) {
  const round = structuredClone(clip.round);
  for (const player of round.players)
    player.name = player.id === clip.focusId ? moveName || 'Move' : 'Opponent';
  return clip.ticks.map((tick) => applyTick(round, tick));
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Mount a looping close-up clip. Options: `compact` (smaller, no labels),
 * `autoplay` (default unless reduced motion), `onState(status, message)`.
 */
export function mountMoveClip(container, selection, options = {}) {
  useStylesheet('/move-clip.css');
  const { compact = false, onState = () => {} } = options,
    autoplay = options.autoplay ?? !reducedMotion(),
    figure = document.createElement('figure'),
    canvas = document.createElement('canvas'),
    status = document.createElement('figcaption'),
    toggle = document.createElement('button'),
    offscreen = document.createElement('canvas'),
    context = canvas.getContext('2d');
  figure.className = `move-clip${compact ? ' is-compact' : ''}`;
  figure.dataset.state = 'loading';
  canvas.width = compact ? 360 : 720;
  canvas.height = compact ? 240 : 480;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${selection.name} in use`);
  status.className = 'move-clip-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading clip…';
  toggle.type = 'button';
  toggle.className = 'move-clip-toggle';
  toggle.hidden = true;
  figure.append(canvas, toggle, status);
  container.replaceChildren(figure);

  let frames = [],
    clip,
    index = 0,
    playing = false,
    destroyed = false,
    visible = true,
    view = null,
    frame = 0,
    last = 0,
    elapsed = 0,
    holdUntil = 0;
  const setState = (state, message = '') => {
    figure.dataset.state = state;
    status.textContent = message;
    status.hidden = !message;
    onState(state, message);
  };
  const label = () => {
    toggle.textContent = playing ? 'Pause' : 'Play';
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${selection.name} clip`);
  };
  function draw(snap = false) {
    const state = frames[index];
    if (!state) return;
    const arena = arenaSize(state);
    renderArena(offscreen, state, { localId: clip.focusId, labels: !compact });
    view = easeView(snap ? null : view, clipView(state, clip.focusId, arena));
    context.imageSmoothingEnabled = false;
    context.drawImage(
      offscreen,
      view.x,
      view.y,
      view.width,
      view.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    figure.dataset.tick = String(state.tick);
  }
  function advance(time) {
    frame = 0;
    if (destroyed || !playing) return;
    const delta = last ? Math.min(250, time - last) : 0;
    last = time;
    if (time >= holdUntil) {
      if (holdUntil) {
        holdUntil = 0;
        index = 0;
        elapsed = 0;
        draw(true);
      }
      elapsed += delta;
      const step = 1000 / CLIP_TICK_RATE;
      while (elapsed >= step && index < frames.length - 1) {
        elapsed -= step;
        index++;
        receiveEffects(frames[index].events);
      }
      if (index >= frames.length - 1) holdUntil = time + LOOP_PAUSE_MS;
    }
    draw();
    if (visible) frame = requestAnimationFrame(advance);
  }
  function play() {
    if (!frames.length || playing) return;
    playing = true;
    last = 0;
    label();
    if (visible && !frame) frame = requestAnimationFrame(advance);
  }
  function pause() {
    playing = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    label();
  }
  toggle.addEventListener('click', () => (playing ? pause() : play()));
  canvas.addEventListener('click', () => (playing ? pause() : play()));
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          if (visible && playing && !frame) {
            last = 0;
            frame = requestAnimationFrame(advance);
          }
        })
      : null;
  observer?.observe(figure);

  const ready = loadMoveClip(selection, options).then(
    (loaded) => {
      if (destroyed) return;
      clip = loaded;
      frames = clipFrames(clip, selection.name);
      // A still shows the moment of use until playback starts.
      index = autoplay ? 0 : Math.min(frames.length - 1, clip.castTick - clip.startTick);
      draw(true);
      toggle.hidden = false;
      setState('ready');
      label();
      if (autoplay) play();
    },
    (error) => {
      if (!destroyed) setState('unavailable', error.message);
    },
  );
  return {
    ready,
    play,
    pause,
    get playing() {
      return playing;
    },
    destroy() {
      destroyed = true;
      pause();
      observer?.disconnect();
      figure.remove();
    },
  };
}
