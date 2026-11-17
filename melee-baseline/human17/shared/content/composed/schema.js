// The Composed move format (format 3): a finite, data-only vocabulary of
// components. The schema is also the contract a generated move must meet.
//
// Format 2 is the same vocabulary without casterAction, guidance, ray and actor;
// upgradeFormat2Move reads it. Nothing writes it.
const str = (max = 32) => ({ type: 'string', minLength: 1, maxLength: max });
const num = (min, max) => ({ type: 'number', minimum: min, maximum: max });
const int = (min, max) => ({ type: 'integer', minimum: min, maximum: max });
const en = (...values) => ({ type: 'string', enum: values });
const obj = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
// Moves stored before a field existed omit it; the generator schema still requires it.
const optional = (schema, ...keys) => ({
  ...schema,
  required: schema.required.filter((key) => !keys.includes(key)),
});
const arr = (items, min, max) => ({ type: 'array', items, minItems: min, maxItems: max });
export const shapeSchema = optional(
  obj({
    kind: en('circle', 'capsule', 'sector', 'segment', 'box'),
    radius: num(1, 100),
    innerRadius: num(0, 90),
    length: num(0, 320),
    width: num(2, 100),
    arc: int(1, 32),
    // Segments only. The width at the far end; it grows linearly from `width`.
    endWidth: num(2, 160),
    // Segments only. Ticks from spawn for the beam to grow from 0 to `length`.
    extend: int(0, 30),
  }),
  'endWidth',
  'extend',
);
const actionSchema = obj({
  op: en('spawn', 'expire'),
  template: str(24),
  count: int(1, 3),
  spread: int(0, 8),
});
const eventSchema = obj({
  when: en('spawn', 'armed', 'timer', 'interval', 'terminal', 'contact', 'pair'),
  at: int(0, 180),
  every: int(3, 60),
  count: int(1, 12),
  reason: en('any', 'impact', 'expiry'),
  actions: arr(actionSchema, 1, 4),
});
const templateSchema = obj({
  id: str(24),
  origin: en(
    'caster_center',
    'caster_muzzle',
    'aim_point_clamped',
    'event_position',
    'owned_anchor',
  ),
  motion: obj({
    kind: en(
      'stationary',
      'linear',
      'caster_attached',
      'return_to_owner',
      'orbit_owner',
      'bounce',
      'lob',
    ),
    speed: num(0, 18),
    acceleration: num(-1, 1),
    sweep: int(-16, 16),
    offset: num(0, 100),
    bounces: int(0, 3),
  }),
  geometry: arr(shapeSchema, 1, 2),
  lifetime: int(1, 180),
  arm: int(0, 60),
  physicalRadius: num(1, 24),
  health: num(0, 60),
  solid: { type: 'boolean' },
  damage: obj({
    amount: num(0, 38),
    shield: num(0, 48),
    policy: en('impact', 'rapid', 'exposure'),
    interval: int(3, 30),
    group: str(24),
  }),
  impulse: num(0, 16),
  force: obj({
    direction: en('none', 'pull', 'repel'),
    strength: num(0, 1.2),
    radius: num(0, 120),
  }),
  terminalOn: obj({ player: { type: 'boolean' }, wall: { type: 'boolean' } }),
  events: arr(eventSchema, 0, 6),
  guidance: obj({
    kind: en('none', 'homing'),
    turnRate: int(0, 2),
    acquireRadius: num(0, 480),
    retargetEvery: int(0, 30),
  }),
  ray: obj({
    kind: en('none', 'reflect'),
    range: num(0, 560),
    bounces: int(0, 3),
  }),
  actor: obj({
    kind: en('none', 'companion', 'decoy'),
    speed: num(0, 4.5),
    leash: num(0, 360),
  }),
});
// Optional, so stored moves stay valid and keep their identity: true marks a
// circular object that turns beams at its edge.
templateSchema.properties.reflectsBeams = { type: 'boolean' };
// Optional: false keeps a free-flying object from being deflected, as for bees.
// Absent means true. Health does not decide deflection.
templateSchema.properties.deflectable = { type: 'boolean' };
// Optional presentation hint with no simulation effect; absent means 'auto'.
templateSchema.properties.visual = en('auto', 'slash', 'thrust');
const moveSchema = obj({
  name: { ...str(14), pattern: '^[a-z0-9 ]+$' },
  formatVersion: { type: 'integer', enum: [3] },
  coreColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  selfDamage: { type: 'boolean' },
  activation: optional(
    obj({
      mode: en('press', 'hold', 'press_sequence'),
      windup: int(0, 30),
      recovery: int(0, 45),
      // Steady windups are not cancelled by impact hits. Absent means false.
      steady: { type: 'boolean' },
    }),
    'steady',
  ),
  resource: obj({
    kind: en('cooldown', 'magazine', 'heat', 'charges', 'fatigue'),
    cooldown: int(3, 180),
    capacity: int(1, 30),
    reload: int(15, 180),
    heatPerShot: num(1, 30),
    cooling: num(0.1, 10),
    threshold: num(1, 100),
  }),
  root: str(24),
  setup: obj({
    kind: en('none', 'pair'),
    linkTemplate: str(24),
    minDistance: num(40, 200),
    maxDistance: num(60, 320),
    timeout: int(30, 180),
  }),
  templates: arr(templateSchema, 1, 8),
  sprite: arr({ type: 'string', pattern: '^[0123]{8}$', minLength: 8, maxLength: 8 }, 8, 8),
  animation: en('pulse', 'spin', 'flicker', 'trail'),
  sound: obj({
    wave: en('square', 'triangle', 'sawtooth'),
    frequency: int(90, 1200),
    slide: int(-600, 600),
    duration: int(60, 400),
  }),
  counterplay: arr(str(180), 2, 4),
  balanceReason: str(600),
  casterAction: obj({
    kind: en('none', 'teleport', 'lunge'),
    range: num(0, 260),
  }),
  // The color carries meaning (a yellow banana peel); calibration keeps it.
  colorLocked: { type: 'boolean' },
});
export const composedMoveSchema = optional(moveSchema, 'colorLocked');
function check(s, v, path = 'move') {
  if (s.enum && !s.enum.includes(v)) throw Error(`${path}: unsupported value`);
  if (s.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(`${path}: expected object`);
    for (const k of s.required) if (!Object.hasOwn(v, k)) throw Error(`${path}.${k}: required`);
    for (const k of Object.keys(v)) {
      if (!s.properties[k]) throw Error(`${path}.${k}: unknown field`);
      check(s.properties[k], v[k], `${path}.${k}`);
    }
  } else if (s.type === 'array') {
    if (!Array.isArray(v) || v.length < s.minItems || v.length > s.maxItems)
      throw Error(`${path}: invalid array length`);
    v.forEach((x, i) => check(s.items, x, `${path}[${i}]`));
  } else if (s.type === 'string') {
    if (
      typeof v !== 'string' ||
      v.length < (s.minLength || 0) ||
      v.length > (s.maxLength ?? Infinity) ||
      (s.pattern && !new RegExp(s.pattern).test(v))
    )
      throw Error(`${path}: invalid string`);
  } else if (s.type === 'boolean') {
    if (typeof v !== 'boolean') throw Error(`${path}: expected boolean`);
  } else if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    (s.type === 'integer' && !Number.isSafeInteger(v)) ||
    v < (s.minimum ?? -Infinity) ||
    v > (s.maximum ?? Infinity)
  )
    throw Error(`${path}: numeric bound`);
}
/**
 * Proves a move's template graph is finite and inside the reservation limits.
 * Returns what one cast reserves: objects, graph depth and actor slots.
 */
export function graphProof(move) {
  const byId = new Map(move.templates.map((t) => [t.id, t]));
  if (byId.size !== move.templates.length) throw Error('Duplicate template ID');
  if (!byId.has(move.root)) throw Error('Root template does not exist');
  const root = byId.get(move.root),
    visiting = new Set(),
    costs = new Map(),
    depths = new Map(),
    work = new Map(),
    scheduled = new Map();
  function visit(id) {
    if (visiting.has(id)) throw Error('Recursive template graph');
    if (costs.has(id)) return costs.get(id);
    const t = byId.get(id);
    if (!t) throw Error(`Missing template reference: ${id}`);
    visiting.add(id);
    let cost = 1,
      depth = 1,
      actions = 0,
      pending = 0;
    for (const ev of t.events) {
      const executions =
        ev.when === 'interval'
          ? Math.min(ev.count, Math.max(0, Math.floor((t.lifetime - ev.at) / ev.every) + 1))
          : ev.when === 'contact'
            ? ev.count
            : 1;
      actions += executions * ev.actions.length;
      if (['timer', 'interval', 'terminal'].includes(ev.when)) pending++;
      for (const a of ev.actions) {
        if (a.op === 'expire') {
          if (a.template !== 'none') throw Error('Expire action has no template');
          continue;
        }
        const child = byId.get(a.template);
        if (!child) throw Error('Missing spawn template');
        if (!['event_position', 'owned_anchor'].includes(child.origin))
          throw Error('Child origin must be event_position or owned_anchor');
        cost += executions * a.count * visit(a.template);
        depth = Math.max(depth, 1 + depths.get(a.template));
        actions += executions * a.count * work.get(a.template);
        pending += executions * a.count * scheduled.get(a.template);
      }
    }
    visiting.delete(id);
    if (depth > 3) throw Error('Spawn graph depth exceeds 3');
    if (cost > 12) throw Error('Cast reservation exceeds 12 objects');
    if (actions > cost * 5 || pending > cost * 2)
      throw Error('Event work or scheduler reservation exceeds owner envelope');
    costs.set(id, cost);
    depths.set(id, depth);
    work.set(id, actions);
    scheduled.set(id, pending);
    return cost;
  }
  for (const t of move.templates) visit(t.id);
  if (['event_position', 'owned_anchor'].includes(root.origin)) throw Error('Invalid root origin');
  let reservation = costs.get(move.root);
  if (move.setup.kind === 'pair') {
    const link = byId.get(move.setup.linkTemplate);
    if (!link) throw Error('Missing link template');
    if (
      move.activation.mode !== 'press_sequence' ||
      root.origin !== 'caster_center' ||
      root.motion.kind !== 'stationary' ||
      root.damage.amount ||
      root.force.direction !== 'none' ||
      root.health <= 0 ||
      root.events.length
    )
      throw Error('Pair setup requires destructible underfoot anchors and distinct presses');
    if (
      link.motion.kind !== 'stationary' ||
      link.geometry.length !== 1 ||
      link.geometry[0].kind !== 'segment' ||
      link.damage.policy !== 'exposure' ||
      link.arm < 12
    )
      throw Error('Link requires warned exposure segment');
    if (move.setup.minDistance >= move.setup.maxDistance) throw Error('Invalid anchor separation');
    reservation = 2 * costs.get(move.root) + costs.get(link.id);
    if (reservation > 12) throw Error('Pair reservation exceeds 12');
  } else if (move.activation.mode === 'press_sequence')
    throw Error('Press sequence requires pair setup');
  const reachable = new Set();
  function walk(id) {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const ev of byId.get(id).events)
      for (const a of ev.actions) if (a.op === 'spawn') walk(a.template);
  }
  walk(move.root);
  if (move.setup.kind === 'pair') walk(move.setup.linkTemplate);
  if (reachable.size !== move.templates.length) throw Error('Unreachable template');
  return {
    reservation,
    depth: Math.max(...depths.values()),
    actorSlots: root.actor.kind === 'none' ? 0 : 1,
  };
}
const inactive = (component, fields) => {
  if (component.kind === 'none' && fields.some((key) => component[key] !== 0))
    throw Error('Inactive components require zero parameters');
};
/** A checked copy of a format-3 move; throws on the first rule it breaks. */
export function validateComposedMove(raw) {
  check(composedMoveSchema, raw);
  if (raw.activation.mode === 'hold' && !['magazine', 'heat'].includes(raw.resource.kind))
    throw Error('Held channels require finite magazine or heat epochs');
  if (!raw.name.trim() || !raw.sprite.some((r) => /[123]/.test(r)))
    throw Error('Name and visible sprite required');
  for (const t of raw.templates) {
    if (t.arm >= t.lifetime) throw Error('Arm time must precede expiry');
    const harmful =
      t.damage.amount > 0 || t.damage.shield > 0 || t.impulse > 0 || t.force.direction !== 'none';
    if (
      (t.motion.kind === 'stationary' && t.lifetime > 180) ||
      (t.motion.kind !== 'stationary' && t.lifetime > 120)
    )
      throw Error('Lifetime exceeds component envelope');
    if (harmful && t.motion.kind === 'stationary' && t.health === 0 && t.lifetime > 90)
      throw Error('Damage areas last at most 90 ticks');
    if (['linear', 'return_to_owner', 'bounce'].includes(t.motion.kind) && t.motion.speed < 0.25)
      throw Error('Moving objects need nonzero speed');
    if (
      t.geometry.some(
        (g) => g.kind !== 'segment' && (g.endWidth !== undefined || g.extend !== undefined),
      )
    )
      throw Error('Only beams taper or extend');
    if (
      t.id === raw.setup.linkTemplate &&
      t.geometry.some((g) => g.endWidth !== undefined || g.extend !== undefined)
    )
      throw Error('A paired link cannot taper or extend');
    if (
      t.motion.kind === 'lob' &&
      (t.motion.speed < 1 ||
        t.health ||
        t.reflectsBeams ||
        t.force.direction !== 'none' ||
        t.geometry.some((g) => g.kind !== 'circle'))
    )
      throw Error('A lob is a harmless-in-flight circle without health, force or reflection');
    if (
      t.motion.kind === 'caster_attached' &&
      t.geometry.some((g) => Math.max(g.radius, g.length) > 100)
    )
      throw Error('Melee reach exceeds 100');
    if (t.geometry.some((g) => g.innerRadius >= g.radius && g.kind === 'sector'))
      throw Error('Invalid annular sector');
    if (
      t.geometry.some((g) => g.kind === 'segment' && g.length > 240) &&
      raw.setup.linkTemplate !== t.id
    )
      throw Error('Free beam exceeds 240');
    if (
      t.geometry.some((g) => g.kind === 'segment') &&
      (t.geometry.length !== 1 || t.motion.kind !== 'stationary')
    )
      throw Error('A beam is one stationary segment');
    if (
      t.reflectsBeams &&
      (t.geometry.length !== 1 ||
        t.geometry[0].kind !== 'circle' ||
        t.solid ||
        t.ray.kind !== 'none' ||
        t.actor.kind !== 'none')
    )
      throw Error('A beam reflector is one non-solid circle');
    if (t.damage.policy === 'rapid' && (t.damage.amount > 8 || t.impulse > 2))
      throw Error('Rapid damage/impulse exceeds reviewed bound');
    if (t.damage.policy === 'exposure' && (t.damage.interval < 6 || t.impulse > 2))
      throw Error('Exposure requires interval >=6 and small impulse');
    if (t.force.direction !== 'none' && (t.force.radius < 20 || t.force.strength <= 0 || t.arm < 6))
      throw Error('Force fields require a readable warning and radius');
    if (t.force.direction === 'none' && (t.force.radius !== 0 || t.force.strength !== 0))
      throw Error('Disabled force must have zero values');
    if (
      raw.selfDamage &&
      ['caster_attached', 'orbit_owner', 'return_to_owner'].includes(t.motion.kind)
    )
      throw Error('Self damage must be disabled for owner-following effects');
    if (t.origin === 'owned_anchor' && t.id !== raw.setup.linkTemplate)
      throw Error('Owned anchor references require the declared paired link');
    if (
      t.solid &&
      (t.health === 0 ||
        t.motion.kind !== 'stationary' ||
        t.geometry.length !== 1 ||
        t.geometry[0].kind !== 'box')
    )
      throw Error('Solid objects require one stationary destructible box');
    for (const ev of t.events) {
      if (ev.when === 'interval' && ev.at < t.arm)
        throw Error('Intervals cannot act before arming');
      if (ev.when === 'pair' && (raw.setup.kind !== 'pair' || t.id !== raw.setup.linkTemplate))
        throw Error('Pair callbacks require the declared paired link');
      if (ev.when === 'timer' && ev.at < t.arm) throw Error('Timers cannot act before arming');
      if (ev.when === 'timer' && ev.at >= t.lifetime) throw Error('Timer exceeds lifetime');
      if (ev.when === 'contact' && ev.count > 4) throw Error('Contact callback limit exceeds 4');
    }
  }
  const root = raw.templates.find((t) => t.id === raw.root);
  if (root) {
    const harmful =
      root.damage.amount > 0 || root.damage.shield > 0 || root.force.direction !== 'none';
    if (root.motion.kind === 'caster_attached' && raw.activation.windup < 3)
      throw Error('Melee requires 3 ticks windup');
    if (harmful && root.motion.kind === 'stationary' && root.arm + raw.activation.windup < 6)
      throw Error('Placed damage requires warning');
    if (
      root.motion.kind === 'stationary' &&
      root.geometry.some((g) => g.radius >= 60 || g.kind === 'segment') &&
      harmful &&
      root.arm + raw.activation.windup < 12
    )
      throw Error('Large areas require 12 ticks warning');
  }
  graphProof(raw);
  inactive(raw.casterAction, ['range']);
  if (raw.casterAction.kind === 'teleport') {
    if (
      raw.casterAction.range < 40 ||
      raw.activation.mode !== 'press' ||
      raw.activation.windup < 6 ||
      raw.setup.kind !== 'none' ||
      raw.selfDamage ||
      root.origin !== 'caster_center' ||
      root.motion.kind !== 'stationary' ||
      root.health ||
      raw.templates.some((t) => t.solid) ||
      root.damage.amount ||
      root.damage.shield ||
      root.impulse ||
      root.force.direction !== 'none' ||
      root.actor.kind !== 'none' ||
      root.ray.kind !== 'none' ||
      root.guidance.kind !== 'none'
    )
      throw Error(
        'Teleport requires a warned press, harmless stationary caster-center marker, no solid descendants and self damage disabled',
      );
  }
  if (
    raw.casterAction.kind === 'lunge' &&
    (raw.casterAction.range < 24 ||
      raw.casterAction.range > 160 ||
      raw.activation.mode !== 'press' ||
      raw.activation.windup < 3 ||
      raw.setup.kind !== 'none')
  )
    throw Error('Lunge requires range 24–160 and a pressed windup of at least 3 ticks');
  for (const t of raw.templates) {
    inactive(t.guidance, ['turnRate', 'acquireRadius', 'retargetEvery']);
    inactive(t.ray, ['range', 'bounces']);
    inactive(t.actor, ['speed', 'leash']);
    if (
      t.guidance.kind === 'homing' &&
      (!['linear', 'bounce'].includes(t.motion.kind) ||
        t.motion.speed > 12 ||
        t.guidance.turnRate < 1 ||
        t.guidance.acquireRadius < 80 ||
        t.guidance.retargetEvery < 3 ||
        t.ray.kind !== 'none' ||
        t.actor.kind !== 'none')
    )
      throw Error('Homing requires bounded moving geometry, gradual turns and acquisition cadence');
    if (t.guidance.kind === 'homing') {
      let speed = t.motion.speed;
      for (let i = 0; i < t.lifetime - t.arm; i++) {
        speed = Math.round(Math.max(0.25, Math.min(18, speed + t.motion.acceleration)) * 256) / 256;
        if (speed > 12) throw Error('Homing speed cannot exceed 12 during its lifetime');
      }
    }
    if (
      t.ray.kind === 'reflect' &&
      (t.motion.kind !== 'stationary' ||
        t.geometry.length !== 1 ||
        t.geometry[0].kind !== 'segment' ||
        t.lifetime > 24 ||
        t.ray.range < 40 ||
        t.ray.bounces < 1 ||
        (t.id === raw.root ? t.arm + raw.activation.windup < 12 : t.arm < 12) ||
        t.terminalOn.player ||
        t.terminalOn.wall ||
        t.solid ||
        t.actor.kind !== 'none' ||
        t.guidance.kind !== 'none')
    )
      throw Error(
        'Reflected rays require a warned short stationary segment and bounded reflection budget; child rays need their own 12-tick arm',
      );
    if (
      t.ray.kind === 'reflect' &&
      t.id === raw.root &&
      t.origin === 'caster_center' &&
      raw.selfDamage
    )
      throw Error('Caster-center rays must disable self damage');
    if (t.actor.kind !== 'none') {
      if (
        t.id !== raw.root ||
        raw.activation.mode !== 'press' ||
        raw.setup.kind !== 'none' ||
        raw.selfDamage ||
        t.motion.kind !== 'stationary' ||
        t.solid ||
        t.geometry.length !== 1 ||
        t.geometry[0].kind !== 'circle' ||
        t.geometry[0].radius > 24 ||
        t.physicalRadius < 8 ||
        t.physicalRadius > 13 ||
        t.health < 12 ||
        t.health > 50 ||
        t.lifetime - t.arm < 30 ||
        t.force.direction !== 'none' ||
        t.guidance.kind !== 'none' ||
        t.ray.kind !== 'none' ||
        t.terminalOn.player ||
        t.terminalOn.wall
      )
        throw Error(
          'Actors require one destructible non-solid root body, finite lifetime and self damage disabled',
        );
      if (
        t.actor.kind === 'companion' &&
        (t.actor.speed < 1 ||
          t.actor.leash < 80 ||
          t.damage.policy !== 'exposure' ||
          t.damage.interval < 12 ||
          t.damage.amount > 12 ||
          t.damage.shield > 12 ||
          t.impulse > 2)
      )
        throw Error('Companions require bounded navigation and readable bite cadence');
      if (
        t.actor.kind === 'decoy' &&
        (t.actor.speed || t.actor.leash || t.damage.amount || t.damage.shield || t.impulse)
      )
        throw Error('Decoys cannot move or deal contact damage');
    }
  }
  return structuredClone(raw);
}
/** Only these values may change during balance tuning; all structure and presentation stay pinned. */
export const COMPOSED_TUNING_FIELDS = [
  'activation.recovery',
  'resource.cooldown',
  'resource.reload',
  'templates.*.damage.amount',
  'templates.*.damage.shield',
  'templates.*.impulse',
  'templates.*.force.strength',
  'actor-templates.*.health',
  // Only when the move sets colorLocked false; see composedMoveIdentity.
  'coreColor',
];
/** The part of a move that tuning may not change; two revisions of one move share it. */
export function composedMoveIdentity(move) {
  const out = JSON.parse(JSON.stringify(move));
  delete out.activation.recovery;
  delete out.resource.cooldown;
  delete out.resource.reload;
  for (const t of out.templates) {
    delete t.damage.amount;
    delete t.damage.shield;
    delete t.impulse;
    delete t.force.strength;
    if (t.actor.kind !== 'none') delete t.health;
    // An operator may mark a released swarm undeflectable without making it a new move.
    delete t.deflectable;
  }
  delete out.balanceReason;
  // An unlocked color may be tuned. A move without the flag predates it and
  // keeps its color in the identity, so stored identities do not change.
  if (out.colorLocked === false) delete out.coreColor;
  return out;
}
/**
 * A format-2 move as a format-3 move: the same components with every later
 * capability switched off. Format-3 moves are validated and returned unchanged.
 */
export function upgradeFormat2Move(raw) {
  if (raw?.formatVersion !== 2) return validateComposedMove(raw);
  const move = structuredClone(raw);
  move.formatVersion = 3;
  move.casterAction = { kind: 'none', range: 0 };
  for (const t of move.templates) {
    t.guidance = { kind: 'none', turnRate: 0, acquireRadius: 0, retargetEvery: 0 };
    t.ray = { kind: 'none', range: 0, bounces: 0 };
    t.actor = { kind: 'none', speed: 0, leash: 0 };
  }
  return validateComposedMove(move);
}
