import { z } from 'zod';
import {
  PROTOCOL_VERSION,
  CHAT_LENGTH,
  LOADOUT_SIZE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from './message-constants.js';
import { ROOM_SETTINGS, clampSetting } from './room-settings.js';
export * from './message-constants.js';

const optionalRaw = z.unknown().optional();
/**
 * @template {string} T
 * @template {z.ZodRawShape} [F={}]
 * @param {T} type
 * @param {F} [fields]
 */
const message = (type, fields = /** @type {F} */ ({})) =>
  z.object({ type: z.literal(type), ...fields });
const team = z.enum(['red', 'yellow', 'green', 'blue'], {
  error: 'Choose red, yellow, green or blue.',
});
export const PASSWORD = z
  .string({ error: 'Use a password between 8 and 64 characters.' })
  .min(PASSWORD_MIN_LENGTH, 'Use a password between 8 and 64 characters.')
  .max(PASSWORD_MAX_LENGTH, 'Use a password between 8 and 64 characters.');
// Profile defaults, colours and looks depend on the existing member. Preserve
// raw values for sanitizeProfile rather than rejecting values it ignores.
const profile = {
  name: optionalRaw,
  color: optionalRaw,
  secondaryColor: optionalRaw,
  look: optionalRaw,
  team: optionalRaw,
  teamColors: optionalRaw,
  handicapPercent: optionalRaw,
};
// Invalid optional settings were historically ignored; finite numbers round and
// clamp, so out-of-range values remain accepted without overwriting defaults.
// Maps, features and editions are checked by the room against content.
const submittedSetting = (row) => {
  if (row.kind === 'map' || row.normalize) return optionalRaw;
  const value = {
    integer: () => z.number().transform((n) => clampSetting(row, n)),
    enum: () => z.enum(row.values),
    boolean: () => z.boolean(),
    features: () => z.array(z.unknown()),
  }[row.kind]();
  return value.optional().catch(undefined);
};
const settings = z.preprocess(
  (value) => (Array.isArray(value) ? {} : value),
  z
    .object(Object.fromEntries(ROOM_SETTINGS.map((row) => [row.key, submittedSetting(row)])), {
      error: 'Invalid room settings.',
    })
    .optional(),
);
const membership = { ...profile, loadout: optionalRaw, password: optionalRaw };
const round = z.number({ error: 'That round has already ended.' }).int().nonnegative();

// These are accepted wire inputs, including legacy coercions. Room membership,
// authority, current-round checks and library lookups remain with the handlers.
export const CLIENT_MESSAGES = Object.freeze({
  ping: message('ping', { at: optionalRaw }),
  leave: message('leave'),
  create: message('create', {
    ...membership,
    settings,
    practice: optionalRaw,
    private: optionalRaw,
  }),
  join: message('join', {
    ...membership,
    code: z.unknown().transform((value) =>
      String(value || '')
        .trim()
        .toUpperCase(),
    ),
  }),
  // Credentials are verified by sessions so invalid credentials keep the
  // resumeFailed response that lets the browser establish a fresh identity.
  resume: message('resume', { id: optionalRaw, token: optionalRaw, room: optionalRaw }),
  input: message('input', {
    roundNumber: optionalRaw,
    inputRevision: optionalRaw,
    // receiveInput clamps axes, retains edges and ignores invalid presses.
    input: optionalRaw,
  }),
  pause: message('pause', {
    roundNumber: round,
    paused: z.boolean({ error: 'Choose pause or resume.' }),
  }),
  // A paused bot match forfeits the fighter and returns the room to its lobby.
  endRound: message('endRound', { roundNumber: round }),
  chat: message('chat', {
    text: z
      .string({ error: 'Chat messages must be text.' })
      .transform((text) =>
        text.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '').trim(),
      )
      .pipe(
        z
          .string()
          .min(1, 'Use between 1 and 280 characters.')
          .max(CHAT_LENGTH, 'Use between 1 and 280 characters.'),
      ),
  }),
  access: message('access', {
    private: z.boolean({ error: 'Choose public or password protected.' }),
    password: optionalRaw,
  }),
  profile: message('profile', profile),
  team: message('team', { team }),
  botTeam: message('botTeam', { id: z.string({ error: 'Bot not found.' }), team }),
  teamAccent: message('teamAccent', {
    team: z.enum(['red', 'yellow', 'green', 'blue'], { error: 'Choose a team color.' }),
    color: optionalRaw,
  }),
  handicap: message('handicap', {
    handicapPercent: z
      .number({ error: 'Choose a health handicap between 10% and 100%.' })
      .transform((value) => Math.max(10, Math.min(100, Math.round(value)))),
  }),
  settings: message('settings', { settings }),
  loadout: message('loadout', {
    names: z
      .array(z.string({ error: 'Choose different library moves.' }), {
        error: 'Choose different library moves.',
      })
      .max(LOADOUT_SIZE, 'Choose different library moves.')
      .refine(
        (names) => new Set(names.filter(Boolean)).size === names.filter(Boolean).length,
        'Choose different library moves.',
      ),
    pendingNames: z
      .array(z.string().regex(/^[a-z0-9 ]{1,14}$/))
      .max(LOADOUT_SIZE)
      .optional(),
    rulesRevision: optionalRaw,
  }),
  participation: message('participation', {
    queued: z.boolean({ error: 'Choose whether to play next round.' }),
  }),
  ready: message('ready'),
  addBot: message('addBot'),
  randomizeBot: message('randomizeBot', { id: z.string({ error: 'Bot not found.' }) }),
  kick: message('kick', { id: z.string({ error: 'Player not found.' }) }),
  removeBot: message('removeBot', { id: z.string({ error: 'Bot not found.' }) }),
  start: message('start'),
  postgame: message('postgame', {
    roundNumber: round,
    choice: z.enum(['lobby', 'replay'], { error: 'Choose replay or return to lobby.' }),
  }),
  rematch: message('rematch'),
  ban: message('ban', {
    roundNumber: optionalRaw,
    choices: z.array(z.object({ targetId: z.string(), name: z.string() })).max(LOADOUT_SIZE - 1),
  }),
});

const record = (schema) => z.record(z.string(), schema);
const nullableTime = z.number().nullable();
const roomSetting = (row) =>
  ({
    integer: () => z.number().int().min(row.range[0]).max(row.range[1]),
    enum: () => z.enum(row.values),
    boolean: () => z.boolean(),
    features: () => z.array(z.string()),
    map: () => z.string(),
  })[row.kind]();
const roomSettings = z.looseObject(
  Object.fromEntries(ROOM_SETTINGS.map((row) => [row.key, roomSetting(row)])),
);
const chatEntry = z.object({
  id: z.number().int(),
  playerId: z.string(),
  name: z.string(),
  text: z.string().min(1).max(CHAT_LENGTH),
  at: z.number(),
});
const member = z.looseObject({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  secondaryColor: z.string(),
  look: z.string(),
  team: team.nullable(),
  handicapPercent: z.number(),
  bot: z.boolean(),
  ready: z.boolean(),
  queued: z.boolean(),
  loadout: z.array(z.string()).max(LOADOUT_SIZE),
  bans: z.array(z.string()),
});
const room = z.object({
  code: z.string(),
  hostId: z.string(),
  phase: z.enum(['lobby', 'banning', 'starting', 'playing', 'finished']),
  private: z.boolean(),
  practice: z.boolean(),
  paused: z.boolean(),
  pausedBy: z.string().nullable(),
  pauseControllerId: z.string().nullable(),
  inputRevision: z.number().int(),
  settings: roomSettings,
  moveClaims: record(z.string()),
  loadoutRulesRevision: z.number().int(),
  roundSettings: roomSettings.nullable(),
  roundPlayers: z.array(member),
  replayId: z
    .string()
    .regex(/^r-[0-9]{8}-[a-f0-9]{24}$/)
    .nullable()
    .optional(),
  replayVotes: record(z.literal('replay')),
  replayDeadline: nullableTime,
  startDeadline: nullableTime,
  replayEligibleIds: z.array(z.string()),
  roundNumber: z.number().int(),
  nextPlayerIds: z.array(z.string()),
  capacity: z.number().int(),
  players: z.array(
    member.extend({
      pendingLoadoutRulesRevision: z.number().int().nullable(),
      pingMs: nullableTime,
      pendingGenerationNames: z.array(z.string()),
      generating: z.boolean(),
      connected: z.boolean(),
      reconnecting: z.boolean(),
      reconnectUntil: nullableTime,
    }),
  ),
  banRemaining: record(z.number().int()),
  banDeadline: nullableTime,
  serverNow: z.number(),
  banLimit: z.number().int(),
  banSubmitted: record(z.boolean()),
  chat: z.array(chatEntry),
  region: z.string(),
  serverId: z.string(),
});
// Outgoing display records are deliberately closed: adding engine state cannot
// silently expose it on the wire. Definitions travel only in the round message.
const optionalNumbers = (...keys) =>
  Object.fromEntries(keys.map((key) => [key, z.number().optional()]));
const optionalBooleans = (...keys) =>
  Object.fromEntries(keys.map((key) => [key, z.boolean().optional()]));
const point = z.strictObject({ x: z.number(), y: z.number() });
const identifier = z.union([z.string(), z.number()]);
const appearance = {
  name: z.string().optional(),
  team: team.nullable().optional(),
  color: z.string().optional(),
  secondaryColor: z.string().optional(),
  look: z.string().optional(),
};
const staticPlayer = z.strictObject({
  id: z.string(),
  ...appearance,
  maxHp: z.number(),
  handicapPercent: z.number().optional(),
  loadout: z.array(z.looseObject({ name: z.string(), formatVersion: z.number().int() })),
});
const tickPlayer = z.strictObject({
  id: z.string(),
  ...optionalNumbers(
    'x',
    'y',
    'vx',
    'vy',
    'hp',
    'shield',
    'shieldRelease',
    'invuln',
    'dashCooldown',
    'dashTicks',
    'score',
    'kills',
    'deaths',
    'lives',
    'respawn',
    'aimX',
    'aimY',
    'itemShield',
    'itemSpeed',
    'meleeCooldown',
    'meleeRecovery',
  ),
  ...optionalBooleans('shielding', 'shieldLocked', 'dead'),
  cooldowns: z.array(z.number()).optional(),
  uses: z.array(z.number()).optional(),
  fatigue: z.array(z.number()).optional(),
  attack: z
    .strictObject({
      ...optionalNumbers('slot', 'remaining', 'aimX', 'aimY'),
      firingPose: z
        .strictObject({
          x: z.number(),
          y: z.number(),
          sourceX: z.number(),
          sourceY: z.number(),
          angle: z.number().int().min(0).max(31),
        })
        .optional(),
    })
    .nullable()
    .optional(),
  meleeAttack: z
    .strictObject({
      remaining: z.number().int().nonnegative(),
      direction: z.number().int().min(0).max(31),
    })
    .nullable()
    .optional(),
  moveResources: record(
    z.strictObject({
      ...optionalNumbers(
        'uses',
        'cooldown',
        'recovery',
        'ammo',
        'reload',
        'heat',
        'fatigue',
        'sequence',
        'timeout',
      ),
      overheated: z.boolean().optional(),
    }),
  ).optional(),
});
const tickEntity = z.strictObject({
  id: identifier,
  owner: z.string(),
  move: z.string(),
  moveKey: z.string().max(80).optional(),
  kind: z.string().optional(),
  templateId: z.string().optional(),
  ...optionalNumbers(
    'x',
    'y',
    'vx',
    'vy',
    'dx',
    'dy',
    'angle',
    'radius',
    'physicalRadius',
    'age',
    'arm',
    'bornTick',
    'windup',
    'ttl',
    'lifetime',
    'hp',
    'maxHp',
  ),
  ...optionalBooleans('solid', 'removed'),
  color: z.string().optional(),
  coreColor: z.string().optional(),
  warning: z.boolean().optional(),
  linkTo: point.nullable().optional(),
  raySegments: z
    .array(
      z.strictObject({
        x: z.number(),
        y: z.number(),
        endX: z.number(),
        endY: z.number(),
        objectId: identifier.nullable().optional(),
        entityId: identifier.nullable().optional(),
      }),
    )
    .optional(),
  actor: z.strictObject({ kind: z.string(), appearance: z.strictObject(appearance) }).optional(),
});
const tickEvent = z.strictObject({
  type: z.string(),
  id: identifier.optional(),
  playerId: z.string().optional(),
  owner: z.string().optional(),
  color: z.string().optional(),
  move: z.string().optional(),
  moveKey: z.string().max(80).optional(),
  team: team.optional(),
  flagTeam: team.optional(),
  reason: z.string().max(80).optional(),
  ...optionalNumbers('x', 'y', 'fromX', 'fromY', 'damage'),
  emote: z.number().int().optional(),
  item: z.string().optional(),
});
const roundMap = z.strictObject({
  id: z.string(),
  revision: z.number().int(),
  ruleset: z.string().optional(),
  objects: z.array(
    z.strictObject({
      id: z.string(),
      material: z.string(),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
      maxHp: z.number(),
    }),
  ),
  controllers: z.array(z.strictObject({ id: z.string() })).optional(),
});
const tickMap = z.strictObject({
  objects: z.array(
    z.strictObject({
      id: z.string(),
      hp: z.number(),
      solid: z.boolean(),
      pendingDestroy: z.boolean(),
    }),
  ),
  controllers: z.array(z.strictObject({ id: z.string(), phase: z.number() })).optional(),
});
const roundMessage = z.strictObject({
  type: z.literal('round'),
  roomCode: z.string(),
  roundNumber: z.number().int(),
  engine: z.enum(['classic', 'composed']),
  engineBuild: z.string(),
  formatVersion: z.number().int(),
  mechanicsVersion: z.enum(['classic', 'composed']).optional(),
  mode: z.enum(['timed', 'lives', 'hill', 'ctf']),
  meleeEnabled: z.boolean().optional(),
  botDifficulty: z.enum(['normal', 'hard']).optional(),
  flagBases: z
    .array(z.strictObject({ team, x: z.number(), y: z.number() }))
    .max(4)
    .optional(),
  combatMoves: record(
    z.union([
      z.strictObject({
        name: z.string(),
        playerIndex: z.number().int().min(0).max(3),
        slot: z.number().int().min(0).max(4),
      }),
      z.strictObject({ name: z.literal('Melee'), builtin: z.literal('melee') }),
    ]),
  ).optional(),
  stage: z.string(),
  timeLimit: z.number(),
  teamBattle: z.boolean().optional(),
  preview: z.boolean().optional(),
  ...optionalBooleans('friendlyFire', 'dashEnabled', 'shieldEnabled'),
  ...optionalNumbers('mapRevision', 'survivalRevision', 'selfDamageRulesRevision'),
  arenaWidth: z.number().int().positive().optional(),
  arenaHeight: z.number().int().positive().optional(),
  players: z.array(staticPlayer),
  map: roundMap.optional(),
});
const tickMessage = z.strictObject({
  type: z.literal('tick'),
  roomCode: z.string(),
  roundNumber: z.number().int(),
  tick: z.number().int(),
  ring: z.number(),
  ended: z.boolean(),
  paused: z.boolean(),
  inputAcks: record(z.number().int()),
  winner: z.string().nullable(),
  winners: z.array(z.string()).optional(),
  winnerTeam: team.nullable().optional(),
  teamScores: record(z.number()).optional(),
  flags: z
    .array(
      z.strictObject({
        team,
        status: z.enum(['home', 'carried', 'dropped']),
        x: z.number(),
        y: z.number(),
        carrierId: z.string().nullable(),
        returnTicks: z.number().int().nonnegative(),
        changedTick: z.number().int(),
      }),
    )
    .max(4)
    .optional(),
  items: z
    .array(
      z.strictObject({
        id: z.number().int(),
        kind: z.string(),
        x: z.number(),
        y: z.number(),
        ttl: z.number().int(),
      }),
    )
    .optional(),
  players: z.array(tickPlayer),
  entities: z.array(tickEntity),
  events: z.array(tickEvent),
  map: tickMap.optional(),
});

// Production sends directly; tests validate the serialized outgoing values.
export const SERVER_MESSAGES = Object.freeze({
  welcome: message('welcome', {
    id: z.string(),
    token: z.string(),
    protocol: z.literal(PROTOCOL_VERSION),
  }),
  resumed: message('resumed', { id: z.string(), token: z.string(), room: z.string().nullable() }),
  resumeFailed: message('resumeFailed', { message: z.string() }),
  room: message('room', { room }),
  round: roundMessage,
  tick: tickMessage,
  latency: message('latency', { roomCode: z.string(), players: record(nullableTime) }),
  kicked: message('kicked', { message: z.string() }),
  chat: message('chat', { roomCode: z.string(), message: chatEntry }),
  error: message('error', { message: z.string(), code: z.string().optional() }),
  pong: message('pong', { at: optionalRaw }),
  left: message('left'),
});

export function parseClientMessage(raw) {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(CLIENT_MESSAGES, raw.type))
    throw Error('Unknown room action.');
  const parsed = CLIENT_MESSAGES[raw.type].safeParse(raw);
  if (!parsed.success) throw Error(parsed.error.issues[0]?.message || 'Invalid message.');
  return parsed.data;
}
