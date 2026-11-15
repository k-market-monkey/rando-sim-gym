/** Versioned, data-only move vocabulary. No generated JavaScript is ever executed. */
export const MOVE_FORMAT_VERSION = 1;
export const KINDS = ['projectile', 'spread', 'beam', 'nova', 'trap', 'orbit', 'wall', 'boomerang'];
export const PALETTE = ['#ffce5c', '#f574a5', '#78f0c5', '#76bcff', '#b49aff', '#ff8965'];
export const moveSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 14, pattern: '^[a-z0-9 ]+$' },
    formatVersion: { type: 'integer', enum: [1] },
    kind: { type: 'string', enum: KINDS },
    element: { type: 'string', enum: ['kinetic', 'fire', 'ice', 'electric', 'void'] },
    damage: { type: 'integer', minimum: 12, maximum: 38 },
    knockback: { type: 'integer', minimum: 0, maximum: 16 },
    cooldown: { type: 'integer', minimum: 24, maximum: 180 },
    speed: { type: 'integer', minimum: 4, maximum: 18 },
    radius: { type: 'integer', minimum: 6, maximum: 70 },
    duration: { type: 'integer', minimum: 6, maximum: 120 },
    count: { type: 'integer', minimum: 1, maximum: 5 },
    windup: { type: 'integer', minimum: 6, maximum: 24 },
    limit: { type: 'string', enum: ['cooldown', 'charges', 'fatigue'] },
    charges: { type: 'integer', minimum: 3, maximum: 12 },
    color: { type: 'string', enum: PALETTE },
    sprite: {
      type: 'array',
      minItems: 8,
      maxItems: 8,
      items: { type: 'string', minLength: 8, maxLength: 8, pattern: '^[0123]{8}$' },
    },
    animation: { type: 'string', enum: ['pulse', 'spin', 'flicker', 'trail'] },
    sound: {
      type: 'object',
      additionalProperties: false,
      properties: {
        wave: { type: 'string', enum: ['square', 'triangle', 'sawtooth'] },
        frequency: { type: 'integer', minimum: 90, maximum: 1200 },
        slide: { type: 'integer', minimum: -600, maximum: 600 },
        duration: { type: 'integer', minimum: 60, maximum: 400 },
      },
      required: ['wave', 'frequency', 'slide', 'duration'],
    },
    balanceReason: { type: 'string', minLength: 1, maxLength: 600 },
  },
  required: [
    'name',
    'formatVersion',
    'kind',
    'element',
    'damage',
    'knockback',
    'cooldown',
    'speed',
    'radius',
    'duration',
    'count',
    'windup',
    'limit',
    'charges',
    'color',
    'sprite',
    'animation',
    'sound',
    'balanceReason',
  ],
};
function check(schema, value, path = 'move') {
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: unsupported value`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`${path}: expected object`);
    for (const key of schema.required || [])
      if (!(key in value)) throw new Error(`${path}.${key}: required`);
    for (const [key, v] of Object.entries(value)) {
      if (!schema.properties[key]) throw new Error(`${path}.${key}: unknown field`);
      check(schema.properties[key], v, `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems)
      throw new Error(`${path}: invalid array length`);
    value.forEach((v, i) => check(schema.items, v, `${path}[${i}]`));
  } else if (schema.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity) ||
      (schema.pattern && !new RegExp(schema.pattern).test(value))
    )
      throw new Error(`${path}: invalid string`);
  } else if (schema.type === 'integer') {
    if (
      !Number.isSafeInteger(value) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity)
    )
      throw new Error(`${path}: integer out of range`);
  }
}
export function validateMove(raw) {
  check(moveSchema, raw);
  if (!raw.name.trim()) throw new Error('Move name cannot be blank');
  if (!raw.sprite.some((row) => /[123]/.test(row)))
    throw new Error('Sprite must have visible pixels');
  // Geometry and cadence enforce fair, readable limits beyond individual numeric bounds.
  if (raw.kind === 'beam' && raw.windup < 12)
    throw new Error('Beams require at least 12 ticks of warning');
  if (raw.kind === 'nova' && raw.radius > 70) throw new Error('Nova too large');
  return JSON.parse(JSON.stringify(raw));
}
const sprite = [
  '00022000',
  '00233200',
  '02311320',
  '23111132',
  '23111132',
  '02311320',
  '00233200',
  '00022000',
];
export function makeMove(name, kind, extra = {}) {
  return validateMove({
    name,
    formatVersion: 1,
    kind,
    element: 'kinetic',
    damage: 26,
    knockback: 7,
    cooldown: 54,
    speed: 11,
    radius: 10,
    duration: 45,
    count: 1,
    windup: 8,
    limit: 'cooldown',
    charges: 8,
    color: PALETTE[0],
    sprite,
    animation: 'pulse',
    sound: { wave: 'square', frequency: 440, slide: -180, duration: 160 },
    balanceReason:
      'Moderate damage, readable warning and finite reach; shield and dash provide counterplay.',
    ...extra,
  });
}
export const BASE_MOVES = [
  makeMove('star shot', 'projectile'),
  makeMove('scatter burst', 'spread', {
    count: 3,
    damage: 18,
    cooldown: 66,
    color: PALETTE[1],
    speed: 10,
    duration: 35,
    element: 'fire',
  }),
  makeMove('laser noodle', 'beam', {
    windup: 18,
    damage: 30,
    cooldown: 72,
    radius: 9,
    duration: 8,
    color: PALETTE[3],
    element: 'electric',
  }),
  makeMove('moon bloom', 'nova', {
    damage: 32,
    cooldown: 66,
    radius: 65,
    duration: 10,
    color: PALETTE[4],
    element: 'void',
  }),
  makeMove('spicy floor', 'trap', {
    damage: 32,
    cooldown: 72,
    radius: 38,
    duration: 120,
    color: PALETTE[5],
    element: 'fire',
  }),
  makeMove('tiny planets', 'orbit', {
    damage: 22,
    cooldown: 84,
    radius: 14,
    duration: 72,
    count: 3,
    color: PALETTE[2],
  }),
  makeMove('ice wall', 'wall', {
    damage: 20,
    cooldown: 90,
    radius: 30,
    duration: 100,
    color: PALETTE[3],
    element: 'ice',
  }),
  makeMove('return mail', 'boomerang', {
    damage: 28,
    cooldown: 66,
    speed: 12,
    radius: 13,
    duration: 45,
    color: PALETTE[1],
    limit: 'fatigue',
  }),
];
export function normalizeName(name) {
  if (typeof name !== 'string' || !/^[a-z0-9 ]{1,14}$/.test(name) || !name.trim())
    throw new Error('Use 1–14 lowercase letters, digits or spaces');
  return name;
}
