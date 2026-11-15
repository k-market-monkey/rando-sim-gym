import { validateComposedMove, graphProof } from '../../content/composed/schema.js';
const cache = new Map();
let objectCache = new WeakMap();
/** Compiles checked data to a bounded plan; no source code or generated expressions. */
export function compileMove(raw) {
  if (objectCache.has(raw)) return objectCache.get(raw);
  const key = JSON.stringify(raw);
  if (cache.has(key)) {
    const plan = cache.get(key);
    objectCache.set(raw, plan);
    return plan;
  }
  const move = validateComposedMove(raw),
    proof = graphProof(move),
    // Only the root template performs the move's caster action.
    templates = Object.fromEntries(
      move.templates.map((t) => [
        t.id,
        { ...t, casterAction: t.id === move.root ? move.casterAction : { kind: 'none', range: 0 } },
      ]),
    );
  const root = templates[move.root];
  const reach = Math.max(
    ...root.geometry.map((g) => (g.kind === 'circle' ? g.radius : Math.max(g.radius, g.length))),
  );
  const moving = ['linear', 'bounce', 'return_to_owner'].includes(root.motion.kind);
  const area = move.templates.some((t) => t.motion.kind === 'stationary' && t.damage.amount > 0);
  const affordances = {
    range:
      root.origin === 'aim_point_clamped'
        ? 210
        : moving
          ? Math.min(520, root.motion.speed * (root.lifetime - root.arm))
          : reach + root.motion.offset,
    preferredDistance:
      root.motion.kind === 'caster_attached'
        ? Math.max(32, reach * 0.7)
        : root.origin === 'caster_center' && root.motion.kind === 'stationary'
          ? 45
          : root.origin === 'aim_point_clamped'
            ? 145
            : moving && root.motion.speed < 3
              ? 135
              : 220,
    setup: move.setup.kind,
    held: move.activation.mode === 'hold',
    moving,
    area,
    force: move.templates.some((t) => t.force.direction !== 'none'),
    trail: move.templates.some((t) =>
      t.events.some((e) => e.when === 'interval' && e.actions.some((a) => a.op === 'spawn')),
    ),
    explosive: move.templates.some((t) =>
      t.events.some((e) => e.when === 'terminal' && e.actions.some((a) => a.op === 'spawn')),
    ),
    selfRisk: move.selfDamage,
    warning: move.activation.windup + root.arm,
    teleport: move.casterAction.kind === 'teleport',
    actor: root.actor.kind,
    homing: root.guidance.kind === 'homing',
    reflectedRay: root.ray.kind === 'reflect',
  };
  if (affordances.teleport) {
    affordances.range = move.casterAction.range;
    affordances.preferredDistance = 150;
  }
  if (affordances.reflectedRay) {
    affordances.range = root.ray.range;
    affordances.preferredDistance = 220;
  }
  if (affordances.actor !== 'none') {
    affordances.range = root.actor.kind === 'companion' ? root.actor.leash : 210;
    affordances.preferredDistance = 170;
  }
  // World support is derived, never written into immutable move artifacts. The
  // map ruleset pins these policies, so old maps and identities remain intact.
  const references = new Map(move.templates.map((t) => [t.id, []]));
  for (const t of move.templates)
    for (const e of t.events)
      for (const a of e.actions) if (a.op === 'spawn') references.get(a.template).push(e.when);
  const supportPolicies = Object.fromEntries(
    move.templates.map((t) => {
      let policy = 'fixed-floor';
      if (['linear', 'bounce', 'return_to_owner'].includes(t.motion.kind)) policy = 'airborne';
      else if (['caster_attached', 'orbit_owner'].includes(t.motion.kind))
        policy = 'owner-following';
      else if (move.setup.kind === 'pair' && t.id === move.setup.linkTemplate)
        policy = 'supported-endpoints';
      else if (
        t.id !== move.root &&
        !t.health &&
        !t.solid &&
        t.force.direction === 'none' &&
        references.get(t.id).length &&
        references.get(t.id).every((when) => when === 'terminal')
      )
        policy = 'free-effect';
      return [t.id, policy];
    }),
  );
  const plan = {
    move,
    templates,
    reservation: proof.reservation,
    depth: proof.depth,
    affordances,
    supportPolicies,
    actorSlots: proof.actorSlots,
  };
  if (cache.size >= 256) cache.delete(cache.keys().next().value);
  cache.set(key, plan);
  objectCache.set(raw, plan);
  objectCache.set(move, plan);
  return plan;
}
export function clearCompilerCache() {
  cache.clear();
  objectCache = new WeakMap();
}
