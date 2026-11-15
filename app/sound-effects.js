// Cosmetic audio only: randomness here never enters the shared simulation.
import { WIDTH } from '../shared/content/arena.js';
import { arenaSize } from './arena-size.js';

const mixers = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const vary = (amount = 0.055) => 1 + (Math.random() * 2 - 1) * amount;
const profiles = {
  projectile: { pitch: 1.15, body: 'square', overtone: 2 },
  spread: { pitch: 0.72, body: 'triangle', noise: 0.34, overtone: 1.5 },
  beam: { pitch: 1.7, body: 'sawtooth', overtone: 2.01, echo: 0.05 },
  nova: { pitch: 0.38, body: 'sine', overtone: 1.5, noise: 0.16 },
  trap: { pitch: 0.85, body: 'triangle', overtone: 3, echo: 0.07 },
  orbit: { pitch: 1.45, body: 'sine', overtone: 1.5, echo: 0.075 },
  wall: { pitch: 1.8, body: 'triangle', overtone: 2.67, noise: 0.12 },
  boomerang: { pitch: 0.9, body: 'triangle', overtone: 2, echo: 0.085 },
};

function mixer(context) {
  if (mixers.has(context)) return mixers.get(context);
  const compressor = context.createDynamicsCompressor(),
    master = context.createGain();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.14;
  master.gain.value = 0.55;
  compressor.connect(master);
  master.connect(context.destination);
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.16), context.sampleRate),
    data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const result = { input: compressor, master, noise, voices: [], lastTick: null, lastRound: null };
  mixers.set(context, result);
  return result;
}

function envelope(context, source, bus, { start, duration, volume, x, noise = false }) {
  const gain = context.createGain(),
    nodes = [source, gain];
  let tail = source;
  if (noise) {
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, start);
    filter.frequency.exponentialRampToValueAtTime(240, start + duration);
    filter.Q.value = 0.7;
    tail.connect(filter);
    tail = filter;
    nodes.push(filter);
  }
  tail.connect(gain);
  tail = gain;
  if (context.createStereoPanner && Number.isFinite(x)) {
    const pan = context.createStereoPanner();
    pan.pan.value = clamp(((x / WIDTH) * 2 - 1) * 0.6, -0.6, 0.6);
    tail.connect(pan);
    tail = pan;
    nodes.push(pan);
  }
  tail.connect(bus.input);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.008, duration * 0.12));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.onended = () => nodes.forEach((node) => node.disconnect());
  source.start(start);
  source.stop(start + duration + 0.012);
}

function tone(context, bus, { start, duration, frequency, end, volume, wave = 'triangle', x }) {
  const oscillator = context.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(clamp(frequency, 45, 6000), start);
  oscillator.frequency.exponentialRampToValueAtTime(clamp(end, 45, 6000), start + duration);
  envelope(context, oscillator, bus, { start, duration, volume, x });
}

/** Play a short, bounded synth effect. Returns false when the mix is already busy. */
export function playSynthSound(context, spec = {}, volume = 0.045, { kind, x } = {}) {
  if (!context || context.state === 'closed') return false;
  try {
    const bus = mixer(context),
      now = context.currentTime;
    bus.voices = bus.voices.filter((end) => end > now);
    if (bus.voices.length >= 10) return false;
    const profile = profiles[kind] || {},
      pitch = (profile.pitch || 1) * vary(0.045);
    const frequency = clamp(finite(spec.frequency, 440), 60, 1800) * pitch;
    const slide = finite(spec.slide, -150) * pitch;
    const duration = clamp((finite(spec.duration, 160) / 1000) * vary(0.07), 0.045, 0.45);
    const level = clamp(finite(volume, 0.045), 0, 0.12) / Math.sqrt(1 + bus.voices.length * 0.5);
    const wave =
      profile.body ||
      (['sine', 'square', 'triangle', 'sawtooth'].includes(spec.wave) ? spec.wave : 'triangle');
    const end = kind === 'boomerang' ? frequency * 1.45 : frequency + slide;
    tone(context, bus, { start: now, duration, frequency, end, volume: level, wave, x });
    if (profile.overtone)
      tone(context, bus, {
        start: now + (profile.echo || 0.004),
        duration: duration * 0.72,
        frequency: frequency * profile.overtone,
        end: kind === 'boomerang' ? frequency * 0.7 : (frequency + slide * 0.6) * profile.overtone,
        volume: level * 0.22,
        wave: 'sine',
        x,
      });
    if (profile.noise) {
      const noise = context.createBufferSource();
      noise.buffer = bus.noise;
      noise.loop = true;
      envelope(context, noise, bus, {
        start: now,
        duration: Math.min(0.13, duration),
        volume: level * profile.noise,
        x,
        noise: true,
      });
    }
    bus.voices.push(now + duration + (profile.echo || 0) + 0.02);
    return true;
  } catch {
    return false;
  }
}

/** One call per received state; cast events avoid replaying persistent entities. */
export function playCombatSounds(context, state, previousState, { localId } = {}) {
  if (!context || !state) return;
  const bus = mixer(context);
  if (previousState && bus.lastTick === state.tick && bus.lastRound === state.roundNumber) return;
  bus.lastTick = state.tick;
  bus.lastRound = state.roundNumber;
  const priority = { kill: 0, shieldbreak: 1, cast: 2, dash: 3, hit: 4 };
  const events = [...(state.events || [])].sort(
    (a, b) => (priority[a.type] ?? 5) - (priority[b.type] ?? 5),
  );
  const heard = new Set();
  let count = 0;
  for (const event of events) {
    if (count >= 8) break;
    const key = event.type + ':' + event.playerId;
    if (heard.has(key)) continue;
    heard.add(key);
    const local = event.playerId === localId,
      // Pan by the position across the arena, whatever its width.
      options = { x: (event.x * WIDTH) / arenaSize(state).width };
    let spec, level;
    if (event.type === 'cast') {
      const move =
        typeof event.move === 'object'
          ? event.move
          : state.players
              ?.find((p) => p.id === event.playerId)
              ?.loadout.find((m) => m.name === event.move);
      if (!move) continue;
      spec = move.sound || {};
      options.kind = move.kind;
      level = local ? 0.052 : 0.035;
    } else if (event.type === 'hit') {
      spec = {
        wave: 'triangle',
        frequency: 210 - finite(event.damage, 20) * 1.5,
        slide: -85,
        duration: 85,
      };
      level = local ? 0.07 : 0.045;
    } else if (event.type === 'dash') {
      spec = { wave: 'sine', frequency: 180, slide: 420, duration: 100 };
      options.kind = 'spread';
      level = local ? 0.045 : 0.028;
    } else if (event.type === 'shieldbreak') {
      spec = { frequency: 540, slide: -410, duration: 240 };
      options.kind = 'wall';
      level = 0.055;
    } else if (event.type === 'kill') {
      spec = { wave: 'sawtooth', frequency: 320, slide: -240, duration: 340 };
      options.kind = 'nova';
      level = 0.065;
    } else continue;
    if (playSynthSound(context, spec, level, options)) count++;
  }
  if (state.ended && previousState && !previousState.ended) {
    const won = state.winner === localId;
    playSynthSound(
      context,
      { wave: 'triangle', frequency: won ? 620 : 300, slide: won ? 260 : -160, duration: 380 },
      0.065,
      { kind: won ? 'orbit' : 'boomerang' },
    );
  }
}
