import { NAME_LENGTH } from '../protocol/limits.js';
/** Cosmetic-only character vocabulary shared by validation and rendering. */
export const CHARACTER_LOOKS = Object.freeze(
  [
    { id: 'round', label: 'Orb' },
    { id: 'ears', label: 'Bunny' },
    { id: 'square', label: 'Block' },
    { id: 'star', label: 'Star' },
    { id: 'ghost', label: 'Ghost' },
    { id: 'bot', label: 'Robot' },
    { id: 'sprout', label: 'Sprout' },
    { id: 'crystal', label: 'Crystal' },
  ].map((look) => Object.freeze(look)),
);
export const DEFAULT_PROFILE = Object.freeze({
  name: 'Player one',
  color: '#dcf76b',
  secondaryColor: '#f574a5',
  look: 'round',
});
const NAME_COLORS = [
  'Amber',
  'Azure',
  'Blue',
  'Coral',
  'Gold',
  'Indigo',
  'Jade',
  'Mint',
  'Rose',
  'Silver',
  'Teal',
  'Violet',
];
const NAME_NOUNS = [
  'Badger',
  'Comet',
  'Falcon',
  'Finch',
  'Fox',
  'Gecko',
  'Heron',
  'Koala',
  'Lynx',
  'Moth',
  'Otter',
  'Panda',
  'Raven',
  'Robin',
  'Sparrow',
  'Tiger',
];
/**
 * A friendly first-visit name; callers persist it rather than regenerating on render.
 * `random` returns a number from 0 up to 1, as `Math.random` does.
 */
export function generateDefaultName(random) {
  const pick = (values) => {
    const value = random();
    return values[
      Number.isFinite(value)
        ? Math.max(0, Math.min(values.length - 1, Math.floor(value * values.length)))
        : 0
    ];
  };
  return `${pick(NAME_COLORS)} ${pick(NAME_NOUNS)}`;
}
const validColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const validLook = (value) => CHARACTER_LOOKS.some((look) => look.id === value);
const cleanName = (value) =>
  typeof value === 'string'
    ? value
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .slice(0, NAME_LENGTH)
    : '';
export function sanitizeProfile(raw = {}, defaults = DEFAULT_PROFILE) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults))
    defaults = DEFAULT_PROFILE;
  return {
    name: cleanName(raw.name) || cleanName(defaults.name) || DEFAULT_PROFILE.name,
    color: (validColor(raw.color)
      ? raw.color
      : validColor(defaults.color)
        ? defaults.color
        : DEFAULT_PROFILE.color
    ).toLowerCase(),
    secondaryColor: (validColor(raw.secondaryColor)
      ? raw.secondaryColor
      : validColor(defaults.secondaryColor)
        ? defaults.secondaryColor
        : DEFAULT_PROFILE.secondaryColor
    ).toLowerCase(),
    look: validLook(raw.look)
      ? raw.look
      : validLook(defaults.look)
        ? defaults.look
        : DEFAULT_PROFILE.look,
  };
}
// 0 transparent, 1 primary body, 2 contrast outline, 3 dark face, 4 light eyes, 5 secondary accents.
export const CHARACTER_SPRITES = Object.freeze({
  round: [
    '00022222000',
    '00255555200',
    '02511111520',
    '25111111152',
    '21133333112',
    '21134343112',
    '21133333112',
    '25111111152',
    '02511111520',
    '00255555200',
    '00220022000',
  ],
  ears: [
    '02000000200',
    '25200002520',
    '25222222520',
    '21111111112',
    '21133333112',
    '21134343112',
    '21133333112',
    '21551115512',
    '02511111520',
    '00255555200',
    '00220022000',
  ],
  square: [
    '02222222220',
    '25555555552',
    '21111111112',
    '21111111112',
    '21333333312',
    '21344344312',
    '21333333312',
    '21551115512',
    '02255555220',
    '00211112000',
    '02200002200',
  ],
  star: [
    '00000200000',
    '00002520000',
    '02225152220',
    '02511111520',
    '00213331200',
    '00213431200',
    '02513331520',
    '25111111152',
    '02251515220',
    '00252025200',
    '00020002000',
  ],
  ghost: [
    '00022222000',
    '00211111200',
    '02111111120',
    '21111111112',
    '21333333312',
    '21344344312',
    '21333333312',
    '21511111512',
    '21551115512',
    '25552525552',
    '02220002220',
  ],
  bot: [
    '00000200000',
    '00002520000',
    '02222222220',
    '25555555552',
    '21333333312',
    '21344344312',
    '21333333312',
    '21111111112',
    '02255555220',
    '00211112000',
    '02520025200',
  ],
  sprout: [
    '00220002200',
    '02552225520',
    '00255555200',
    '00022522000',
    '00211111200',
    '02133333120',
    '21134343112',
    '21133333112',
    '02511111520',
    '00255555200',
    '00220022000',
  ],
  crystal: [
    '00000200000',
    '00002520000',
    '00025152000',
    '00251115200',
    '02513331520',
    '25134343152',
    '02513331520',
    '00251115200',
    '00025152000',
    '00002520000',
    '00000200000',
  ],
});
