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
export const COMPOSED_GENERATION_EXAMPLES = [
  ...COMPOSED_FEATURE_MOVES,
  ...COMPOSED_BASE_MOVES.filter((move) =>
    ['pepper stream', 'twin wire', 'comet shell'].includes(move.name),
  ),
];
