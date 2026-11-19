import { weaponFields } from './weapon-settings.js';
import { CHARACTER_LOOKS, DEFAULT_PROFILE } from './human18/shared/content/characters.js';
export const ROOT_DEFAULTS = {
  difficulty: 'moderate',
  style: 'balanced',
  speed: 0.75,
  knockback: 3,
  flinch: 6,
  parry: 6,
  shieldRelease: 8,
  shieldRearm: 15,
  swipeCooldown: 14,
  hitboxes: false,
  hitRadius: 13,
  shape: DEFAULT_PROFILE.look,
};
export function defaults(moves) {
  return {
    ...ROOT_DEFAULTS,
    moves: Object.fromEntries(
      moves.map((m) => [
        m.name,
        Object.fromEntries(weaponFields(m).map((f) => [f.key, f.target[f.property]])),
      ]),
    ),
  };
}
const number = (value, fallback, min, max, integer = false) => {
  let n = Number(value);
  if (value === undefined || !Number.isFinite(n)) n = fallback;
  n = Math.max(min, Math.min(max, n));
  return integer ? Math.round(n) : n;
};
export function sanitize(moves, raw = {}) {
  const d = defaults(moves),
    r = { ...d, moves: {} };
  for (const [key, choices] of Object.entries({
    shape: CHARACTER_LOOKS.map((look) => look.id),
    difficulty: ['moderate', 'hard', 'impossible', 'normal'],
    style: ['balanced', 'aggressive', 'ranged-strafing', 'defensive', 'stationary'],
    speed: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4],
  }))
    r[key] = choices.includes(raw[key]) ? raw[key] : d[key];
  for (const [key, min, max, int] of [
    ['knockback', 0, 10, false],
    ['flinch', 0, 120, true],
    ['parry', 0, 120, true],
    ['hitRadius', 1, 40, true],
    ['shieldRelease', 0, 180, true],
    ['shieldRearm', 0, 180, true],
    ['swipeCooldown', 0, 180, true],
  ])
    r[key] = number(raw[key], d[key], min, max, int);
  r.hitboxes = raw.hitboxes === true;
  for (const m of moves) {
    const override = raw.moves?.[m.name] || {},
      b = d.moves[m.name];
    r.moves[m.name] = Object.fromEntries(
      weaponFields(m).map((f) => [
        f.key,
        number(override[f.key], b[f.key], f.min, f.max, f.step === 1),
      ]),
    );
  }
  return r;
}
export function tunedMoves(moves, tuning) {
  return moves.map((move) => {
    const m = structuredClone(move);
    for (const f of weaponFields(m)) f.target[f.property] = tuning.moves[m.name][f.key];
    return m;
  });
}
export function readRaw(text) {
  try {
    return JSON.parse(text) || {};
  } catch {
    return {};
  }
}
export function playLink(pair, side, tuning) {
  const url = new URL('play-v18.html', new URL('.', import.meta.url));
  url.searchParams.set('v', '27');
  url.searchParams.set('order', '25');
  url.searchParams.set('pair', pair);
  url.searchParams.set('side', side);
  url.searchParams.set('tune', JSON.stringify(tuning));
  return url.href;
}
