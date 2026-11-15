// Emote keys and the pixel-art faces that rise from a player who emotes.
import { EMOTES } from '../shared/content/emotes.js';

export const EMOTE_KEYS = ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

/** The emote number (1–5) for a key, or 0 when the key casts a move or is not an emote key. */
export function emoteForKey(code, bindings = {}) {
  if (Object.values(bindings).includes(code)) return 0;
  const index = EMOTE_KEYS.indexOf(code);
  return index >= 0 && index < EMOTES.length ? index + 1 : 0;
}

const PALETTE = {
  o: '#2a2410',
  k: '#2a2410',
  y: '#ffd84a',
  a: '#f0704a',
  w: '#ffffff',
  r: '#f0475a',
  b: '#6cc6ff',
  p: '#ff8fa8',
};
/** An 11×11 face filled with `fill`, with rows 3–8 replaced by `features`. */
function face(fill, features) {
  const rows = [
    '...ooooo...',
    '..oFFFFFo..',
    '.oFFFFFFFo.',
    'oFFFFFFFFFo',
    'oFFFFFFFFFo',
    'oFFFFFFFFFo',
    'oFFFFFFFFFo',
    'oFFFFFFFFFo',
    '.oFFFFFFFo.',
    '..oFFFFFo..',
    '...ooooo...',
  ].map((row) => row.replaceAll('F', fill));
  features.forEach((row, i) => (rows[3 + i] = row));
  return rows;
}
// Indexed by emote number - 1, in the order of EMOTES.
export const EMOTE_SPRITES = [
  face('y', [
    'oyykyyykyyo',
    'oykykykykyo',
    'obyyyyyyybo',
    'obkkkkkkkbo',
    'oykwrrrwkyo',
    '.oyykkkyyo.',
  ]),
  face('y', [
    'oyryryryryo',
    'oyrrryrrryo',
    'oyyryyyryyo',
    'oyyyyyyyyyo',
    'oykyyyyykyo',
    '.oykkkkkyo.',
  ]),
  face('y', [
    'oywwyyywwyo',
    'oywkyyywkyo',
    'oyyyyyyyyyo',
    'oppyyyyyppo',
    'oyyykkkyyyo',
    '.oyyyyyyyo.',
  ]),
  face('y', [
    'oyyyyyyyyyo',
    'oykyyyyykyo',
    'oybyyyyyyyo',
    'oybyyyyyyyo',
    'oyyykkkyyyo',
    '.oykyyykyo.',
  ]),
  face('a', [
    'oakaaaaakao',
    'oaakaaakaao',
    'oaakaaakaao',
    'oaaaaaaaaao',
    'oaaakkkaaao',
    '.oakaaakao.',
  ]),
];

const SCALE = 3,
  DURATION = 1100,
  MAX_ACTIVE = 256;
const active = [];

/** Starts a rising face for each emote event. */
export function receiveEmotes(events = [], now = performance.now(), random = Math.random) {
  // Bound memory even when a hidden tab receives events without drawing.
  for (let i = active.length - 1; i >= 0; i--)
    if (now - active[i].born >= DURATION || now < active[i].born) active.splice(i, 1);
  for (const event of events)
    if (event.type === 'emote' && EMOTE_SPRITES[event.emote - 1]) {
      // Cosmetic randomness stays entirely outside the deterministic simulation.
      const angle = (random() - 0.5) * 0.9,
        speed = 95 + random() * 30;
      active.push({
        playerId: event.playerId,
        emote: event.emote,
        x: event.x,
        y: event.y - 38,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        born: now,
      });
    }
  if (active.length > MAX_ACTIVE) active.splice(0, active.length - MAX_ACTIVE);
}

export function drawEmoteSprite(ctx, emote, x, y, scale = SCALE) {
  const sprite = EMOTE_SPRITES[emote - 1],
    left = x - (sprite[0].length * scale) / 2,
    top = y - (sprite.length * scale) / 2;
  for (const [row, line] of sprite.entries())
    for (const [column, pixel] of [...line].entries()) {
      if (pixel === '.') continue;
      ctx.fillStyle = PALETTE[pixel];
      ctx.fillRect(left + column * scale, top + row * scale, scale, scale);
    }
}

/** Draws independent faces from their launch positions, rising and fading. */
export function drawEmotes(ctx, state, now = performance.now()) {
  for (let i = active.length - 1; i >= 0; i--) {
    const e = active[i],
      f = (now - e.born) / DURATION;
    if (f >= 1 || f < 0) {
      active.splice(i, 1);
      continue;
    }
    const player = state.players?.find((p) => p.id === e.playerId);
    if (player?.dead) continue;
    const seconds = (now - e.born) / 1000,
      x = e.x + e.vx * seconds,
      y = e.y + e.vy * seconds;
    ctx.save();
    ctx.globalAlpha = f < 0.7 ? 1 : (1 - f) / 0.3;
    drawEmoteSprite(ctx, e.emote, Math.round(x), Math.round(y));
    ctx.restore();
  }
}
