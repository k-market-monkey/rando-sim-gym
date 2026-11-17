// The handwritten Composed moves: the default loadout, the library's seeds and
// the examples shown to the move generator.
import { validateComposedMove } from './schema.js';
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
export const shape = (kind = 'circle', extra = {}) => ({
  kind,
  radius: 9,
  innerRadius: 0,
  length: 0,
  width: 10,
  arc: 16,
  ...extra,
});
export const template = (id, extra = {}) => ({
  id,
  origin: 'caster_muzzle',
  motion: { kind: 'linear', speed: 10, acceleration: 0, sweep: 0, offset: 0, bounces: 0 },
  geometry: [shape()],
  lifetime: 45,
  arm: 0,
  physicalRadius: 5,
  health: 0,
  solid: false,
  damage: { amount: 24, shield: 30, policy: 'impact', interval: 8, group: 'hit' },
  impulse: 6,
  force: { direction: 'none', strength: 0, radius: 0 },
  terminalOn: { player: true, wall: true },
  events: [],
  ...extra,
});
const motion = (kind, speed = 0, extra = {}) => ({
  kind,
  speed,
  acceleration: 0,
  sweep: 0,
  offset: 0,
  bounces: 0,
  ...extra,
});
const damage = (amount, policy = 'impact', interval = 8) => ({
  amount,
  shield: Math.min(48, amount * 1.25),
  policy,
  interval,
  group: 'hit',
});
const event = (when, templateId, extra = {}) => ({
  when,
  at: 0,
  every: 6,
  count: 1,
  reason: 'any',
  actions: [{ op: 'spawn', template: templateId, count: 1, spread: 0 }],
  ...extra,
});
const none = {
  guidance: { kind: 'none', turnRate: 0, acquireRadius: 0, retargetEvery: 0 },
  ray: { kind: 'none', range: 0, bounces: 0 },
  actor: { kind: 'none', speed: 0, leash: 0 },
};
/**
 * A checked move from templates made with `template`. `extra` overrides
 * move-level fields. `components` switches features on: `casterAction` for the
 * move, and per template ID any of `guidance`, `ray` and `actor`.
 */
export function makeComposedMove(name, templates, extra = {}, components = {}) {
  // Copied through JSON so templates built from shared constants share nothing.
  const move = JSON.parse(
    JSON.stringify({
      name,
      formatVersion: 3,
      coreColor: '#76bcff',
      selfDamage: false,
      activation: { mode: 'press', windup: 8, recovery: 6 },
      resource: {
        kind: 'cooldown',
        cooldown: 54,
        capacity: 8,
        reload: 60,
        heatPerShot: 12,
        cooling: 1,
        threshold: 100,
      },
      root: templates[0].id,
      setup: {
        kind: 'none',
        linkTemplate: 'none',
        minDistance: 60,
        maxDistance: 280,
        timeout: 150,
      },
      templates,
      sprite,
      animation: 'pulse',
      sound: { wave: 'triangle', frequency: 440, slide: -180, duration: 160 },
      counterplay: ['Shield or dash through the attack.', 'Move outside the marked damage area.'],
      balanceReason: 'Bounded geometry, readable warnings and finite resources.',
      ...extra,
      casterAction: components.casterAction || { kind: 'none', range: 0 },
    }),
  );
  for (const id of Object.keys(components.templates || {}))
    if (!move.templates.some((t) => t.id === id)) throw Error(`No template named ${id}`);
  for (const t of move.templates)
    Object.assign(t, structuredClone(none), structuredClone(components.templates?.[t.id] || {}));
  return validateComposedMove(move);
}
const blast = (id) =>
  template(id, {
    origin: 'event_position',
    motion: motion('stationary'),
    geometry: [shape('circle', { radius: 64 })],
    lifetime: 7,
    arm: 0,
    physicalRadius: 1,
    damage: damage(30),
    impulse: 10,
    terminalOn: { player: false, wall: false },
  });
const anchor = template('anchor', {
  origin: 'caster_center',
  motion: motion('stationary'),
  geometry: [shape('circle', { radius: 10 })],
  lifetime: 180,
  arm: 6,
  physicalRadius: 9,
  health: 24,
  damage: damage(0),
  impulse: 0,
  terminalOn: { player: false, wall: false },
});
const link = template('wire', {
  origin: 'owned_anchor',
  motion: motion('stationary'),
  geometry: [shape('segment', { length: 280, width: 10 })],
  lifetime: 90,
  arm: 12,
  physicalRadius: 1,
  damage: damage(6, 'exposure', 12),
  impulse: 1,
  terminalOn: { player: false, wall: false },
});
const field = (direction) =>
  template('field', {
    origin: 'aim_point_clamped',
    motion: motion('stationary'),
    geometry: [shape('circle', { radius: 76 })],
    lifetime: 75,
    arm: 12,
    physicalRadius: 8,
    health: 24,
    damage: damage(4, 'exposure', 15),
    impulse: 0,
    force: { direction, strength: 0.55, radius: 100 },
    terminalOn: { player: false, wall: false },
  });
/** Handwritten foundation fixtures: each family is composition, never a runtime recipe branch. */
const FOUNDATION_MOVES = [
  makeComposedMove(
    'arc blade',
    [
      template('blade', {
        origin: 'caster_center',
        motion: motion('caster_attached', 0, { sweep: 10, offset: 4 }),
        geometry: [shape('sector', { radius: 66, innerRadius: 12, arc: 8 })],
        lifetime: 10,
        arm: 0,
        physicalRadius: 1,
        damage: damage(25),
        impulse: 7,
        terminalOn: { player: false, wall: false },
      }),
    ],
    {
      activation: { mode: 'press', windup: 7, recovery: 12 },
      resource: {
        kind: 'cooldown',
        cooldown: 34,
        capacity: 8,
        reload: 60,
        heatPerShot: 12,
        cooling: 1,
        threshold: 100,
      },
    },
  ),
  makeComposedMove(
    'pepper stream',
    [
      template('bullet', {
        geometry: [shape('capsule', { radius: 3, length: 10, width: 6 })],
        lifetime: 35,
        motion: motion('linear', 14),
        physicalRadius: 3,
        damage: damage(4, 'rapid', 3),
        impulse: 0.4,
      }),
    ],
    {
      coreColor: '#ff5555',
      activation: { mode: 'hold', windup: 0, recovery: 0 },
      resource: {
        kind: 'magazine',
        cooldown: 3,
        capacity: 12,
        reload: 60,
        heatPerShot: 12,
        cooling: 1,
        threshold: 100,
      },
      sound: { wave: 'square', frequency: 620, slide: -250, duration: 65 },
    },
  ),
  makeComposedMove('twin wire', [anchor, link], {
    activation: { mode: 'press_sequence', windup: 0, recovery: 3 },
    resource: {
      kind: 'cooldown',
      cooldown: 12,
      capacity: 8,
      reload: 60,
      heatPerShot: 12,
      cooling: 1,
      threshold: 100,
    },
    setup: { kind: 'pair', linkTemplate: 'wire', minDistance: 60, maxDistance: 280, timeout: 150 },
    counterplay: [
      'Destroy either anchor to disarm the beam.',
      'The beam warns before activating and cannot pass through walls.',
    ],
  }),
  makeComposedMove(
    'ticking gift',
    [
      template('bomb', {
        origin: 'caster_center',
        motion: motion('stationary'),
        geometry: [shape('circle', { radius: 11 })],
        lifetime: 48,
        arm: 6,
        health: 22,
        physicalRadius: 9,
        damage: damage(0),
        impulse: 0,
        terminalOn: { player: false, wall: false },
        events: [event('terminal', 'burst', { reason: 'expiry' })],
      }),
      blast('burst'),
    ],
    {
      coreColor: '#ffd75c',
      selfDamage: true,
      resource: {
        kind: 'charges',
        cooldown: 48,
        capacity: 8,
        reload: 60,
        heatPerShot: 12,
        cooling: 1,
        threshold: 100,
      },
      counterplay: [
        'Destroy the planted bomb before its fuse expires.',
        'Leave the marked blast radius.',
      ],
    },
  ),
  makeComposedMove(
    'comet shell',
    [
      template('shell', {
        damage: damage(0),
        impulse: 0,
        motion: motion('linear', 8),
        health: 10,
        events: [event('terminal', 'burst')],
      }),
      blast('burst'),
    ],
    {
      coreColor: '#ffbd55',
      selfDamage: true,
      resource: {
        kind: 'cooldown',
        cooldown: 64,
        capacity: 8,
        reload: 60,
        heatPerShot: 12,
        cooling: 1,
        threshold: 100,
      },
    },
  ),
  makeComposedMove(
    'ember ribbon',
    [
      template('head', {
        motion: motion('linear', 6),
        lifetime: 48,
        damage: damage(0),
        impulse: 0,
        terminalOn: { player: false, wall: true },
        events: [event('interval', 'ember', { at: 6, every: 6, count: 7 })],
      }),
      template('ember', {
        origin: 'event_position',
        motion: motion('stationary'),
        geometry: [shape('circle', { radius: 22 })],
        lifetime: 33,
        arm: 3,
        physicalRadius: 1,
        damage: damage(5, 'exposure', 12),
        impulse: 0,
        terminalOn: { player: false, wall: false },
      }),
    ],
    {
      animation: 'trail',
      coreColor: '#ff8965',
      resource: {
        kind: 'cooldown',
        cooldown: 78,
        capacity: 8,
        reload: 60,
        heatPerShot: 12,
        cooling: 1,
        threshold: 100,
      },
      counterplay: [
        'Leave the small circles left behind the projectile.',
        'Trail segments share one damage cadence.',
      ],
    },
  ),
  makeComposedMove(
    'slow lantern',
    [
      template('lantern', {
        motion: motion('linear', 1.75),
        lifetime: 120,
        geometry: [shape('circle', { radius: 24 })],
        health: 18,
        physicalRadius: 12,
        damage: damage(28),
        impulse: 9,
      }),
    ],
    {
      resource: {
        kind: 'heat',
        cooldown: 36,
        capacity: 8,
        reload: 60,
        heatPerShot: 28,
        cooling: 0.35,
        threshold: 100,
      },
    },
  ),
  makeComposedMove('gravity well', [field('pull')], {
    coreColor: '#b49aff',
    resource: {
      kind: 'cooldown',
      cooldown: 100,
      capacity: 8,
      reload: 60,
      heatPerShot: 12,
      cooling: 1,
      threshold: 100,
    },
    counterplay: [
      'Walk outward or dash to escape the bounded pull.',
      'Destroy the central object or use a wall for cover.',
    ],
  }),
  makeComposedMove('outward tide', [field('repel')], {
    coreColor: '#78f0c5',
    resource: {
      kind: 'cooldown',
      cooldown: 100,
      capacity: 8,
      reload: 60,
      heatPerShot: 12,
      cooling: 1,
      threshold: 100,
    },
    counterplay: [
      'Shield reduces displacement; dash ignores the field.',
      'Destroy the central object or approach behind cover.',
    ],
  }),
];
const stationary = {
  kind: 'stationary',
  speed: 0,
  acceleration: 0,
  sweep: 0,
  offset: 0,
  bounces: 0,
};
const harmless = { amount: 0, shield: 0, policy: 'impact', interval: 12, group: 'hit' };
const fixed = {
  motion: stationary,
  terminalOn: { player: false, wall: false },
  force: { direction: 'none', strength: 0, radius: 0 },
  impulse: 0,
};
const cooldown = (ticks) => ({
  kind: 'cooldown',
  cooldown: ticks,
  capacity: 8,
  reload: 60,
  heatPerShot: 12,
  cooling: 1,
  threshold: 100,
});
/** One or more moves for each feature: reflected ray, teleport, companion, decoy and homing. */
export const COMPOSED_FEATURE_MOVES = [
  makeComposedMove(
    'bouncing laser',
    [
      template('ray', {
        ...fixed,
        origin: 'caster_center',
        geometry: [shape('segment', { length: 200, width: 8 })],
        lifetime: 8,
        physicalRadius: 1,
        damage: { amount: 18, shield: 23, policy: 'impact', interval: 12, group: 'beam' },
      }),
    ],
    {
      coreColor: '#ff5577',
      activation: { mode: 'press', windup: 14, recovery: 10 },
      resource: cooldown(78),
      animation: 'flicker',
      sound: { wave: 'square', frequency: 880, slide: -420, duration: 100 },
      counterplay: [
        'The complete reflected path is marked before the beam fires.',
        'Dash across the short pulse or use a shield; the ray reflects at most twice.',
      ],
      balanceReason:
        'A narrow, short-lived reflected ray with a fixed total travel budget and visible warning.',
    },
    { templates: { ray: { ray: { kind: 'reflect', range: 480, bounces: 2 } } } },
  ),
  makeComposedMove(
    'rabid hunt dog',
    [
      template('dog', {
        ...fixed,
        origin: 'caster_muzzle',
        geometry: [shape('circle', { radius: 14 })],
        lifetime: 150,
        arm: 6,
        physicalRadius: 12,
        health: 28,
        damage: { amount: 5, shield: 6, policy: 'exposure', interval: 15, group: 'bite' },
        impulse: 1,
      }),
    ],
    {
      coreColor: '#ca8b55',
      activation: { mode: 'press', windup: 12, recovery: 10 },
      resource: cooldown(150),
      sprite: [
        '00000000',
        '01200210',
        '01311310',
        '01111110',
        '00133100',
        '00111100',
        '00100100',
        '00100100',
      ],
      sound: { wave: 'sawtooth', frequency: 180, slide: 140, duration: 120 },
      counterplay: [
        'Destroy the dog or keep moving outside its short bite range.',
        'The companion follows walkable routes and cannot pass through walls or water.',
      ],
      balanceReason:
        'One destructible companion with bounded lifetime, leash and slow repeated contact damage.',
    },
    { templates: { dog: { actor: { kind: 'companion', speed: 3.5, leash: 320 } } } },
  ),
  makeComposedMove(
    'teleport',
    [
      template('arrival', {
        ...fixed,
        origin: 'caster_center',
        geometry: [shape('circle', { radius: 12 })],
        lifetime: 12,
        physicalRadius: 1,
        damage: harmless,
      }),
    ],
    {
      coreColor: '#67baff',
      activation: { mode: 'press', windup: 6, recovery: 12 },
      resource: cooldown(90),
      animation: 'flicker',
      sound: { wave: 'triangle', frequency: 300, slide: 560, duration: 180 },
      counterplay: [
        'The arrival marker warns where the caster intends to move.',
        'Attack during the windup or recovery; blocked or unsupported destinations cancel the teleport.',
      ],
      balanceReason:
        'A capped-range reposition with a warning and recovery, no attack damage, and legal destination checks.',
    },
    { casterAction: { kind: 'teleport', range: 220 } },
  ),
  makeComposedMove(
    'decoy player',
    [
      template('decoy', {
        ...fixed,
        origin: 'caster_center',
        geometry: [shape('circle', { radius: 12 })],
        lifetime: 180,
        physicalRadius: 12,
        health: 26,
        damage: harmless,
      }),
    ],
    {
      coreColor: '#769cbd',
      activation: { mode: 'press', windup: 8, recovery: 7 },
      resource: { ...cooldown(101), reload: 53 },
      animation: 'pulse',
      sound: { wave: 'triangle', frequency: 440, slide: -100, duration: 140 },
      counterplay: [
        'The stationary decoy cannot attack, capture the hill or block movement.',
        'A few hits destroy it; watch the real player’s movement to distinguish them.',
      ],
      balanceReason:
        'A destructible visual distraction with no damage, collision wall or scoring ability.',
    },
    { templates: { decoy: { actor: { kind: 'decoy', speed: 0, leash: 0 } } } },
  ),
  makeComposedMove(
    'homing missile',
    [
      template('missile', {
        motion: { kind: 'linear', speed: 5, acceleration: 0, sweep: 0, offset: 0, bounces: 0 },
        geometry: [shape('capsule', { radius: 5, length: 14, width: 10 })],
        lifetime: 80,
        physicalRadius: 5,
        health: 12,
        damage: { amount: 20, shield: 25, policy: 'impact', interval: 12, group: 'hit' },
        impulse: 5,
      }),
    ],
    {
      coreColor: '#739cff',
      activation: { mode: 'press', windup: 10, recovery: 8 },
      resource: cooldown(75),
      animation: 'trail',
      sprite: [
        '00023000',
        '00023000',
        '00211300',
        '02111130',
        '02111130',
        '00211300',
        '00023000',
        '00020000',
      ],
      sound: { wave: 'sawtooth', frequency: 330, slide: 180, duration: 220 },
      counterplay: [
        'The missile turns gradually toward a nearby enemy; sidestep or dash past it.',
        'Destroy it, shield its impact or put solid cover between you and its flight path.',
      ],
      balanceReason:
        'One destructible guided projectile with a bounded turn rate, acquisition radius, speed and lifetime.',
    },
    {
      templates: {
        missile: {
          guidance: { kind: 'homing', turnRate: 1, acquireRadius: 420, retargetEvery: 6 },
        },
      },
    },
  ),
];
export const COMPOSED_BASE_MOVES = [...FOUNDATION_MOVES, ...COMPOSED_FEATURE_MOVES];
/** @param {string} id @param {object} geometry @param {Record<string, any>} [options] */
const blade = (id, geometry, { motion: attach, ...extra } = {}) =>
  template(id, {
    origin: 'caster_center',
    motion: motion('caster_attached', 0, attach),
    geometry: [geometry],
    lifetime: 6,
    arm: 0,
    physicalRadius: 1,
    damage: damage(20),
    impulse: 6,
    terminalOn: { player: false, wall: false },
    ...extra,
  });
/**
 * Archetype moves: three melee strikes that feel close to the built-in swipe
 * (2 ticks windup, 64 px, 20 damage) and three answers to ranged play.
 */
export const COMPOSED_ARCHETYPE_MOVES = [
  makeComposedMove(
    'lunge slash',
    [
      blade('blade', shape('sector', { radius: 58, innerRadius: 10, arc: 10 }), {
        motion: { sweep: 8, offset: 4 },
        visual: 'slash',
      }),
    ],
    {
      coreColor: '#7fd4ff',
      colorLocked: false,
      activation: { mode: 'press', windup: 4, recovery: 6 },
      resource: cooldown(24),
      animation: 'flicker',
      sound: { wave: 'sawtooth', frequency: 520, slide: -300, duration: 90 },
      counterplay: [
        'The caster dashes straight at the aim during a short windup; sidestep the line.',
        'Shield the slash, or hit the caster to cancel the dash.',
      ],
      balanceReason: 'Swipe-sized slash that closes 90 px at the cost of a committed windup.',
    },
    { casterAction: { kind: 'lunge', range: 90 } },
  ),
  makeComposedMove(
    'spinning sweep',
    [
      blade('spin', shape('sector', { radius: 56, innerRadius: 6, arc: 16 }), {
        motion: { sweep: 16, offset: 0 },
        lifetime: 8,
        damage: damage(16),
        impulse: 9,
        visual: 'slash',
      }),
    ],
    {
      coreColor: '#c9a0ff',
      colorLocked: false,
      activation: { mode: 'press', windup: 5, recovery: 8 },
      resource: cooldown(30),
      sound: { wave: 'triangle', frequency: 360, slide: 240, duration: 140 },
      counterplay: [
        'The spin covers every side but reaches only 56 px; stay out of reach.',
        'Its long recovery leaves the caster open afterwards.',
      ],
      balanceReason: 'All-round reach and knockback in exchange for lower damage and recovery.',
    },
  ),
  makeComposedMove(
    'spear thrust',
    [
      blade('spear', shape('capsule', { radius: 7, length: 74, width: 14 }), {
        motion: { sweep: 0, offset: 8 },
        lifetime: 5,
        damage: damage(22),
        impulse: 8,
        visual: 'thrust',
      }),
    ],
    {
      coreColor: '#ffb070',
      colorLocked: false,
      activation: { mode: 'press', windup: 4, recovery: 6 },
      resource: cooldown(22),
      sound: { wave: 'square', frequency: 300, slide: 420, duration: 70 },
      counterplay: [
        'The spear reaches far along one narrow line; step to the side.',
        'Shield the tip or close inside its reach.',
      ],
      balanceReason: 'Longer, narrower reach than the swipe on a similar cadence.',
    },
  ),
  makeComposedMove(
    'widening laser',
    [
      template('beam', {
        ...fixed,
        origin: 'caster_center',
        geometry: [shape('segment', { length: 240, width: 6, endWidth: 72, extend: 8 })],
        lifetime: 16,
        physicalRadius: 1,
        damage: { amount: 20, shield: 25, policy: 'impact', interval: 12, group: 'beam' },
        impulse: 4,
      }),
    ],
    {
      coreColor: '#ff4fd8',
      colorLocked: false,
      activation: { mode: 'press', windup: 12, recovery: 10 },
      resource: cooldown(80),
      animation: 'flicker',
      sound: { wave: 'sawtooth', frequency: 220, slide: 600, duration: 260 },
      counterplay: [
        'The beam shoots out over 8 ticks and is widest far away; close in or step aside.',
        'The path is marked during a long windup and stops at walls.',
      ],
      balanceReason: 'Punishes distant fighters with a wide far end while staying narrow up close.',
    },
  ),
  makeComposedMove(
    'lob grenade',
    [
      template('grenade', {
        origin: 'caster_center',
        motion: motion('lob', 9),
        geometry: [shape('circle', { radius: 7 })],
        lifetime: 28,
        physicalRadius: 6,
        damage: harmless,
        impulse: 0,
        terminalOn: { player: false, wall: false },
        events: [event('terminal', 'burst', { reason: 'impact' })],
      }),
      blast('burst'),
    ],
    {
      coreColor: '#ffd84a',
      colorLocked: false,
      selfDamage: true,
      activation: { mode: 'press', windup: 6, recovery: 8 },
      resource: cooldown(60),
      sound: { wave: 'triangle', frequency: 180, slide: -90, duration: 220 },
      counterplay: [
        'The grenade flies over walls to a marked point; leave the marked circle.',
        'It cannot be shot or swiped in the air, and its blast hurts its thrower too.',
      ],
      balanceReason: 'Reaches fighters behind cover, with a long flight and a marked landing.',
    },
  ),
  makeComposedMove(
    'artillery',
    [
      template('shell', {
        origin: 'aim_point_clamped',
        motion: motion('stationary'),
        geometry: [shape('circle', { radius: 54 })],
        lifetime: 30,
        arm: 24,
        physicalRadius: 4,
        damage: damage(28),
        impulse: 8,
        terminalOn: { player: false, wall: false },
      }),
    ],
    {
      coreColor: '#ff7a3d',
      colorLocked: false,
      activation: { mode: 'press', windup: 4, recovery: 6 },
      resource: cooldown(66),
      sound: { wave: 'sawtooth', frequency: 140, slide: -60, duration: 300 },
      counterplay: [
        'The strike zone is marked for 24 ticks before it lands; walk out of it.',
        'It hits only where it was aimed, so keep moving.',
      ],
      balanceReason: 'Denies a camping spot at range behind a long, visible warning.',
    },
  ),
];
/** The existing ranged moves that round out the archetype set. */
export const COMPOSED_RANGED_PICKS = Object.freeze([
  'pepper stream',
  'homing missile',
  'bouncing laser',
]);
export const COMPOSED_GENERATION_EXAMPLES = [
  ...COMPOSED_FEATURE_MOVES,
  ...COMPOSED_BASE_MOVES.filter((move) =>
    ['pepper stream', 'twin wire', 'comet shell'].includes(move.name),
  ),
  // The one melee example: a short-windup lunge with a slash.
  ...COMPOSED_ARCHETYPE_MOVES.filter((move) => move.name === 'lunge slash'),
];

/**
 * The built-in Shoot bullet: light, quick and short-lived. The simulation owns
 * its fire interval and heat, so this move's activation and resource are unused.
 */
export const BUILTIN_SHOOT = makeComposedMove(
  'builtin shoot',
  [
    template('bullet', {
      motion: motion('linear', 12),
      geometry: [shape('circle', { radius: 4 })],
      lifetime: 32,
      physicalRadius: 3,
      damage: { amount: 8, shield: 10, policy: 'impact', interval: 8, group: 'hit' },
      impulse: 2,
    }),
  ],
  {
    coreColor: '#ffffff',
    sound: { wave: 'square', frequency: 720, slide: -260, duration: 60 },
    counterplay: ['Shield or swipe the shot away.', 'Strafe; each shot is small and slow.'],
    balanceReason: 'Low damage on a fixed fire interval that overheats after a short burst.',
  },
);
