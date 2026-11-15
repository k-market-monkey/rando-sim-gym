import {
  q,
  clamp,
  unit,
  dir,
  direction,
  overlap,
  blockedSegment,
  hitEntity,
  hitRect,
  solidRect,
  axisAngle,
  spatialIndex,
} from './geometry.js';
import { relationDamageScale, recordTeamKill } from '../teams.js';
import { MELEE } from './melee.js';
import { damageMapObject, getStateMap } from '../map-state.js';
import { floorSupports, floorSupportsBox } from '../../content/floor.js';
import { BORDER, stateArena } from '../../content/arena.js';
import { FLAG_TOUCH_RADIUS } from '../../content/ctf.js';
import { simulationOptimizations } from '../performance-options.js';
import { compileMove } from './compiler.js';
import { componentWalls as walls, isFixedBeam, fixedBeamPlacement } from './mechanics.js';
import * as features from './features.js';
import { hypot } from '../exact-math.js';
import { combatMoveKey, MELEE_MOVE } from './combat-identity.js';
/** Adds to a telemetry counter, for the match and for the move. */
export const count = (s, name, m = null, n = 1) => {
  if (m === MELEE_MOVE) {
    s.telemetry.melee ??= {};
    s.telemetry.melee[name] = (s.telemetry.melee[name] || 0) + n;
    return;
  }
  s.telemetry[name] = (s.telemetry[name] || 0) + n;
  if (m) {
    if (!Object.hasOwn(s.telemetry.perMove, m.name)) s.telemetry.perMove[m.name] = {};
    const stats = s.telemetry.perMove[m.name];
    stats[name] = (stats[name] || 0) + n;
  }
};
const resource = (p, m) => p.moveResources[m.name];
const player = (s, id) => s.players.find((p) => p.id === id);
export function resetResources(p) {
  p.moveResources = Object.fromEntries(
    p.loadout.map((m) => [
      m.name,
      {
        life: p.life,
        cooldown: 0,
        ammo: m.resource.capacity,
        reload: 0,
        heat: 0,
        overheated: false,
        uses: 0,
        fatigue: 0,
        recovery: 0,
        sequence: 0,
        anchors: [],
        link: null,
        timeout: 0,
        reservationId: null,
      },
    ]),
  );
  p.attack = null;
  p.pendingAttack = null;
  p.heldAttackOrder = [];
  p.channel = null;
  p.cooldowns = Array(5).fill(0);
  p.uses = Array(5).fill(0);
  p.fatigue = Array(5).fill(0);
}
export function tickResources(s, p) {
  for (const m of new Map(p.loadout.map((m) => [m.name, m])).values()) {
    const r = resource(p, m);
    r.cooldown = Math.max(0, r.cooldown - 1);
    r.recovery = Math.max(0, r.recovery - 1);
    if (r.reload > 0 && --r.reload === 0) r.ammo = m.resource.capacity;
    r.heat = q(Math.max(0, r.heat - m.resource.cooling));
    if (r.overheated && r.heat <= m.resource.threshold * 0.25) r.overheated = false;
    if (s.tick % 90 === 0) r.fatigue = Math.max(0, r.fatigue - 1);
    if (r.sequence && r.timeout > 0 && --r.timeout === 0) clearSequence(s, p, m);
  }
  syncResources(p);
}
function syncResources(p) {
  p.cooldowns = p.loadout.map((m) => resource(p, m).cooldown);
  p.uses = p.loadout.map((m) => resource(p, m).uses);
  p.fatigue = p.loadout.map((m) => resource(p, m).fatigue);
}
function ready(p, m) {
  const r = resource(p, m);
  return (
    r.cooldown === 0 &&
    r.recovery === 0 &&
    r.reload === 0 &&
    !r.overheated &&
    !(m.resource.kind === 'charges' && r.ammo <= 0) &&
    !(m.resource.kind === 'magazine' && r.ammo <= 0)
  );
}
function reserve(s, p, plan) {
  const reserved = s.reservations.filter((r) => r.owner === p.id).reduce((n, r) => n + r.cost, 0);
  if (
    reserved + plan.reservation > 24 ||
    s.reservations.reduce((n, r) => n + r.cost, 0) + plan.reservation > 96 ||
    !features.actorSlotsFree(s, p, plan)
  ) {
    count(s, 'capacityBlocks', plan.move);
    return null;
  }
  const reservation = {
    id: s.nextReservationId++,
    owner: p.id,
    ownerLife: p.life,
    cost: plan.reservation,
    spawned: 0,
  };
  if (plan.actorSlots) reservation.actorSlots = plan.actorSlots;
  s.reservations.push(reservation);
  return reservation.id;
}
function release(s, id) {
  s.reservations = s.reservations.filter((r) => r.id !== id);
}
function pruneReservations(s) {
  const active = new Set(s.entities.filter((e) => !e.removed).map((e) => e.reservationId));
  for (const p of s.players) {
    if (p.attack) active.add(p.attack.reservationId);
    for (const r of Object.values(p.moveResources)) if (r.sequence) active.add(r.reservationId);
  }
  s.reservations = s.reservations.filter((r) => active.has(r.id));
}
function supportedPose(s, t, pose, policy) {
  if (policy !== 'fixed-floor') return true;
  const map = getStateMap(s);
  if (!map.floorMask) return true;
  if (t.solid) {
    return floorSupportsBox(map, solidRect({ ...pose, geometry: t.geometry[0] }));
  }
  return floorSupports(map, pose.x, pose.y, Math.max(1, t.physicalRadius));
}
function basePlacement(s, p, t, aimX = p.aimX, aimY = p.aimY, policy = 'fixed-floor') {
  const aim = direction(aimX - p.x, aimY - p.y),
    // A solid wall faces the nearest axis. Its anchor stays at the aim point;
    // from the caster's muzzle it stands straight ahead.
    a = t.solid ? axisAngle(aim) : aim,
    [dx, dy] = dir(t.solid && t.origin !== 'caster_muzzle' ? aim : a);
  let x = p.x,
    y = p.y;
  if (t.origin === 'caster_muzzle') {
    const clearance =
      15 +
      Math.max(
        t.physicalRadius,
        ...t.geometry.map((g) =>
          ['circle', 'capsule', 'sector'].includes(g.kind) ? g.radius : g.width / 2,
        ),
      );
    x += dx * clearance;
    y += dy * clearance;
  }
  if (t.origin === 'aim_point_clamped') {
    const distance = Math.min(210, hypot(aimX - p.x, aimY - p.y));
    x += dx * distance;
    y += dy * distance;
  }
  const margin = 20 + t.physicalRadius,
    { width, height } = stateArena(s);
  x = q(clamp(x, margin, width - margin));
  y = q(clamp(y, margin, height - margin));
  if (t.solid) {
    const rect = solidRect({ x, y, angle: a, geometry: t.geometry[0] });
    if (
      (s.mode === 'ctf' &&
        s.flagBases.some((base) => overlap(base.x, base.y, FLAG_TOUCH_RADIUS, rect))) ||
      rect.x < BORDER ||
      rect.y < BORDER ||
      rect.x + rect.w > width - BORDER ||
      rect.y + rect.h > height - BORDER ||
      walls(s).some(
        (w) =>
          rect.x < w.x + w.w &&
          rect.x + rect.w > w.x &&
          rect.y < w.y + w.h &&
          rect.y + rect.h > w.y,
      )
    )
      return null;
  }
  if (
    walls(s).some((w) => overlap(x, y, t.physicalRadius, w)) ||
    blockedSegment(p.x, p.y, x, y, walls(s), t.origin === 'caster_center' ? 0 : t.physicalRadius)
  )
    return null;
  if (!supportedPose(s, t, { x, y, angle: a }, policy)) return null;
  return { x, y, angle: a };
}
function placement(s, p, t, aimX = p.aimX, aimY = p.aimY, policy = 'fixed-floor') {
  const prepared = features.placement(s, p, t, aimX, aimY, policy, api);
  return prepared === undefined ? basePlacement(s, p, t, aimX, aimY, policy) : prepared;
}
/** Where casting the move now would place its root effect, or null where it
 * cannot. Reads the state without changing it; the browser draws it. */
export function previewPlacement(s, p, m, aimX = p.aimX, aimY = p.aimY) {
  const plan = compileMove(m);
  return placement(s, p, plan.templates[m.root], aimX, aimY, plan.supportPolicies[m.root]);
}
function entity(s, p, m, templateId, pose, reservationId, parent = null) {
  const plan = compileMove(m),
    t = plan.templates[templateId],
    reservation = s.reservations.find((r) => r.id === reservationId);
  if (t.solid) pose = { ...pose, angle: axisAngle(pose.angle ?? 0) };
  if (
    t.solid &&
    s.mode === 'ctf' &&
    s.flagBases.some((base) =>
      overlap(base.x, base.y, FLAG_TOUCH_RADIUS, solidRect({ ...pose, geometry: t.geometry[0] })),
    )
  )
    return null;
  // A grounded trail above a gap leaves no deposit. It is not a failed content
  // reservation and cannot suppress a promised airborne terminal explosion.
  if (!supportedPose(s, t, pose, plan.supportPolicies[templateId])) return null;
  if (!reservation || reservation.spawned >= reservation.cost || s.entities.length >= 96) {
    s.contentFaults.push({ tick: s.tick, name: m.name, reason: 'reservation overflow' });
    return null;
  }
  reservation.spawned++;
  const e = {
    id: s.nextEntityId++,
    owner: p.id,
    ownerLife: p.life,
    life: p.life,
    move: m,
    moveKey: combatMoveKey(s, m),
    templateId,
    reservationId,
    familyId: parent?.familyId ?? reservationId,
    depth: parent ? parent.depth + 1 : 1,
    x: q(pose.x),
    y: q(pose.y),
    previousX: q(pose.x),
    previousY: q(pose.y),
    originX: q(pose.x),
    originY: q(pose.y),
    angle: pose.angle,
    previousAngle: pose.angle,
    baseAngle: pose.angle,
    age: 0,
    arm: t.arm,
    ttl: t.lifetime,
    lifetime: t.lifetime,
    bornTick: s.tick,
    geometry: t.geometry[0],
    geometries: t.geometry,
    motion: t.motion,
    physicalRadius: t.physicalRadius,
    coreColor: m.coreColor,
    color: m.coreColor,
    warning: true,
    hp: t.health,
    maxHp: t.health,
    solid: t.solid,
    linkTo: pose.linkTo ?? null,
    anchorIds: null,
    force: t.force.direction === 'none' ? null : t.force,
    terminal: false,
    removed: false,
    bounces: t.motion.kind === 'bounce' ? Math.min(t.motion.bounces, 2) : t.motion.bounces,
    eventCounts: Array(t.events.length).fill(0),
    contactIds: [],
    speed: t.motion.speed,
    fatigueScale: m.resource.kind === 'fatigue' ? 1 / (1 + resource(p, m).fatigue * 0.22) : 1,
  };
  s.entities.push(e);
  features.initializeEntity(s, e, p, t, api);
  return e;
}
function consume(s, p, m) {
  const r = resource(p, m),
    policy = m.resource;
  r.cooldown = policy.cooldown;
  r.recovery = m.activation.recovery;
  r.uses++;
  r.fatigue = Math.min(4, r.fatigue + 1);
  if (policy.kind === 'charges' || policy.kind === 'magazine') {
    r.ammo--;
    if (policy.kind === 'magazine' && r.ammo === 0) r.reload = policy.reload;
  }
  if (policy.kind === 'heat') {
    r.heat = q(Math.min(policy.threshold, r.heat + policy.heatPerShot));
    if (r.heat >= policy.threshold) r.overheated = true;
  }
  count(s, 'activations', m);
  s.events.push({
    type: 'cast',
    x: p.x,
    y: p.y,
    playerId: p.id,
    move: m,
    moveKey: combatMoveKey(s, m),
  });
  syncResources(p);
}
function commit(s, p, attack) {
  const m = p.loadout[attack.slot],
    plan = compileMove(m),
    t = plan.templates[m.root],
    r = resource(p, m),
    pose = attack.firingPose
      ? fixedBeamPlacement(s, m, attack.firingPose)
      : placement(s, p, t, attack.aimX, attack.aimY, plan.supportPolicies[m.root]);
  // A first anchor can disappear during the second placement's windup. That
  // stale continuation must not become a fresh setup using its spent reservation.
  if (attack.continuation && (r.sequence !== 1 || r.reservationId !== attack.reservationId))
    return false;
  if (!pose) {
    count(s, 'invalidPlacements', m);
    if (!attack.continuation) release(s, attack.reservationId);
    return false;
  }
  if (m.setup.kind === 'pair' && r.sequence === 1) {
    const first = s.entities.find((e) => e.id === r.anchors[0] && !e.removed),
      distance = first ? hypot(pose.x - first.x, pose.y - first.y) : 0;
    if (
      !first ||
      distance < m.setup.minDistance ||
      distance > m.setup.maxDistance ||
      blockedSegment(first.x, first.y, pose.x, pose.y, walls(s), 2)
    ) {
      count(s, 'invalidPlacements', m);
      return false;
    }
    const second = entity(s, p, m, m.root, pose, r.reservationId);
    if (!second) return false;
    const beam = entity(
      s,
      p,
      m,
      m.setup.linkTemplate,
      {
        x: first.x,
        y: first.y,
        angle: direction(second.x - first.x, second.y - first.y),
        linkTo: { x: second.x, y: second.y },
      },
      r.reservationId,
      first,
    );
    if (!beam) return false;
    beam.anchorIds = [first.id, second.id];
    beam.familyId = first.familyId;
    r.anchors.push(second.id);
    r.link = beam.id;
    r.sequence = 2;
    r.timeout = 0;
    count(s, 'pairs', m);
    bindings(s, beam, 'pair');
  } else {
    const spawned = entity(s, p, m, m.root, pose, attack.reservationId);
    if (!spawned) return false;
    if (m.setup.kind === 'pair') {
      r.sequence = 1;
      r.anchors = [spawned.id];
      r.reservationId = attack.reservationId;
      r.timeout = m.setup.timeout;
    }
  }
  if (pose.teleport) features.teleportCaster(s, p, m, pose.teleport, api);
  consume(s, p, m);
  return true;
}
export function cancelAttack(s, p) {
  p.pendingAttack = null;
  p.heldAttackOrder = [];
  p.meleeAttack = null;
  if (p.attack && !p.attack.continuation) release(s, p.attack.reservationId);
  p.attack = null;
  p.channel = null;
}
export function processAttack(s, p, input) {
  if (p.dead || p.shielding || p.shieldRelease > 0 || p.dashTicks > 0) {
    cancelAttack(s, p);
    return;
  }
  const held = (input.heldSlots || []).filter(Number.isInteger),
    pressed = (input.pressedSlots || [])
      .filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < p.loadout.length)
      .reverse();
  // Preserve the most recent held key order so releasing C restores held X
  // before the older mouse button. At most the loadout's five slots survive.
  p.heldAttackOrder = [
    ...new Set([
      ...pressed.filter((slot) => held.includes(slot)),
      ...(p.heldAttackOrder || []).filter((slot) => held.includes(slot)),
      ...held.slice().sort((a, b) => a - b),
    ]),
  ].filter((slot) => slot >= 0 && slot < p.loadout.length);
  if (p.pendingAttack && p.pendingAttack.expires < s.tick) p.pendingAttack = null;
  const busy =
    p.attack ||
    p.meleeAttack ||
    p.meleeRecovery > 0 ||
    Object.values(p.moveResources).some((r) => r.recovery > 0);
  if (pressed.length || input.melee) {
    const current = p.attack && p.loadout[p.attack.slot],
      remaining = Math.max(
        p.attack ? p.attack.remaining + current.activation.recovery : 0,
        p.meleeAttack ? p.meleeAttack.remaining + MELEE.recovery : 0,
        p.meleeRecovery || 0,
        ...Object.values(p.moveResources).map((r) => r.recovery),
      );
    // Wait for this committed action only; readiness is checked once afterwards.
    p.pendingAttack = { slot: pressed.length ? pressed[0] : -1, expires: s.tick + remaining + 2 };
  }
  if (p.meleeAttack || p.meleeRecovery > 0) return false;
  if (p.attack) {
    const m = p.loadout[p.attack.slot];
    if (
      m.activation.mode === 'hold' &&
      !p.attack.latched &&
      !input.heldSlots?.includes(p.attack.slot)
    ) {
      const pending = p.pendingAttack,
        heldOrder = p.heldAttackOrder;
      cancelAttack(s, p);
      p.pendingAttack = pending;
      p.heldAttackOrder = heldOrder;
      return;
    }
    if (--p.attack.remaining <= 0) {
      const attack = p.attack;
      p.attack = null;
      commit(s, p, attack);
    }
    return true;
  }
  if (!busy && p.pendingAttack) {
    const selected = p.pendingAttack.slot;
    if (!pressed.length) pressed.push(selected);
    p.pendingAttack = null;
    if (selected === -1) {
      p.channel = null;
      return 'melee';
    }
  }
  const slots = [...new Set([...pressed, ...p.heldAttackOrder])].filter(
    (i) => i >= 0 && i < p.loadout.length,
  );
  p.channel = null;
  for (const slot of slots) {
    const m = p.loadout[slot],
      r = resource(p, m);
    if (
      m.activation.mode === 'hold'
        ? !held.includes(slot) && !pressed.includes(slot)
        : !pressed.includes(slot)
    )
      continue;
    if (m.activation.mode === 'hold') p.channel = slot;
    if (m.setup.kind === 'pair' && r.sequence === 2) continue;
    if (!ready(p, m)) {
      count(s, 'resourceBlocks', m);
      continue;
    }
    // A fighter may not bypass committed recovery by switching weapons.
    if (Object.values(p.moveResources).some((x) => x.recovery > 0)) return;
    const plan = compileMove(m),
      pose = placement(s, p, plan.templates[m.root], p.aimX, p.aimY, plan.supportPolicies[m.root]);
    if (!pose) {
      count(s, 'invalidPlacements', m);
      return;
    }
    const continuation = m.setup.kind === 'pair' && r.sequence === 1;
    if (continuation) {
      const first = s.entities.find((e) => e.id === r.anchors[0] && !e.removed);
      const d = first ? hypot(first.x - pose.x, first.y - pose.y) : 0;
      if (
        !first ||
        d < m.setup.minDistance ||
        d > m.setup.maxDistance ||
        blockedSegment(first.x, first.y, pose.x, pose.y, walls(s), 2)
      ) {
        count(s, 'invalidPlacements', m);
        return;
      }
    }
    const reservationId = continuation ? r.reservationId : reserve(s, p, plan);
    if (reservationId == null) return;
    const attack = {
      slot,
      remaining: m.activation.windup,
      aimX: p.aimX,
      aimY: p.aimY,
      moveName: m.name,
      reservationId,
      continuation,
      ...(m.activation.mode === 'hold' && !held.includes(slot) && { latched: true }),
      ...(isFixedBeam(m) && { firingPose: { ...pose, sourceX: p.x, sourceY: p.y } }),
    };
    if (attack.remaining > 0) p.attack = attack;
    else commit(s, p, attack);
    return true;
  }
}
function remove(e) {
  e.removed = true;
  e.ttl = 0;
}
function clearSequence(s, p, m) {
  const r = resource(p, m);
  for (const e of s.entities)
    if (e.owner === p.id && e.move.name === m.name && e.reservationId === r.reservationId)
      remove(e);
  Object.assign(r, { sequence: 0, anchors: [], link: null, timeout: 0, reservationId: null });
}
export function clearOwned(s, p) {
  cancelAttack(s, p);
  for (const e of s.entities) if (e.owner === p.id) remove(e);
  s.pendingImpacts = s.pendingImpacts.filter((x) => x.owner !== p.id);
  s.reservations = s.reservations.filter((r) => r.owner !== p.id);
  for (const m of p.loadout) clearSequence(s, p, m);
}
function bindings(s, e, when, reason = 'any') {
  const p = player(s, e.owner);
  if (!p || p.dead || p.life !== e.ownerLife) return;
  const t = compileMove(e.move).templates[e.templateId];
  for (let i = 0; i < t.events.length; i++) {
    const b = t.events[i];
    if (b.when !== when || (b.reason !== 'any' && b.reason !== reason)) continue;
    const max = b.when === 'interval' || b.when === 'contact' ? b.count : 1;
    if (e.eventCounts[i] >= max) continue;
    if (
      (b.when === 'timer' && e.age < b.at) ||
      (b.when === 'interval' && (e.age < b.at || (e.age - b.at) % b.every !== 0))
    )
      continue;
    e.eventCounts[i]++;
    for (const action of b.actions) {
      s.actionWork[e.owner] = (s.actionWork[e.owner] || 0) + 1;
      if (s.actionWork[e.owner] > 128) {
        s.contentFaults.push({ tick: s.tick, name: e.move.name, reason: 'action work overflow' });
        remove(e);
        return;
      }
      if (action.op === 'expire') {
        terminal(s, e, 'expiry');
        continue;
      }
      for (let n = 0; n < action.count; n++) {
        const pose = {
          x: e.x,
          y: e.y,
          angle: e.angle + (n - (action.count - 1) / 2) * action.spread,
        };
        const child = entity(s, p, e.move, action.template, pose, e.reservationId, e);
        if (child) {
          if (when === 'terminal') count(s, 'detonations', e.move);
          if (when === 'interval') count(s, 'trailSegments', e.move);
        }
      }
    }
  }
}
function terminal(s, e, reason) {
  if (e.terminal || e.removed) return;
  e.terminal = true;
  bindings(s, e, 'terminal', reason);
  remove(e);
}
export function sampleForces(s, p) {
  if (p.dead || p.dashTicks > 0) return [0, 0];
  let fx = 0,
    fy = 0;
  for (const e of s.entities) {
    if (e.removed || e.bornTick >= s.tick || e.age < e.arm || !e.force) continue;
    const owner = player(s, e.owner),
      scale = relationDamageScale(e.move, owner, p, s);
    if (!scale) continue;
    const distance = hypot(p.x - e.x, p.y - e.y);
    if (distance === 0 || distance > e.force.radius || blockedSegment(e.x, e.y, p.x, p.y, walls(s)))
      continue;
    const sign = e.force.direction === 'pull' ? -1 : 1,
      [dx, dy] = unit(p.x - e.x, p.y - e.y),
      strength = e.force.strength * scale * (p.shielding ? 0.25 : 1);
    fx += dx * sign * strength;
    fy += dy * sign * strength;
    count(s, 'forceTicks', e.move);
  }
  const length = hypot(fx, fy);
  if (length > 1.2) {
    fx *= 1.2 / length;
    fy *= 1.2 / length;
  }
  return [q(fx), q(fy)];
}
export function damagePlayer(
  s,
  target,
  amount,
  kx = 0,
  ky = 0,
  impulse = 0,
  ownerId = null,
  move = null,
  policy = 'impact',
  shieldDamage = amount * 1.25,
) {
  if (target.dead || target.hardProtection > 0 || target.itemShield > 0 || target.dashTicks > 0)
    return false;
  const owner = player(s, ownerId),
    scale = relationDamageScale(move, owner, target, s);
  amount = q(amount * scale);
  shieldDamage = q(shieldDamage * scale);
  impulse *= scale;
  if (!amount && !shieldDamage && !impulse) return false;
  if (policy === 'impact' && target.impactRecovery > 0) return false;
  if (target.shielding) {
    target.shield = q(Math.max(0, target.shield - shieldDamage));
    target.vx = q(target.vx + kx * impulse * 0.25);
    target.vy = q(target.vy + ky * impulse * 0.25);
    if (target.shield === 0) {
      target.shieldLocked = true;
      target.shielding = false;
      target.shieldRelease = 8;
      s.events.push({ type: 'shieldbreak', x: target.x, y: target.y, playerId: target.id });
    }
    count(s, 'shieldDamage', move, shieldDamage);
    return true;
  }
  target.hp = q(Math.max(0, target.hp - amount));
  target.vx = q(target.vx + kx * impulse);
  target.vy = q(target.vy + ky * impulse);
  if (policy === 'impact') target.impactRecovery = 8;
  target.lastHit = ownerId;
  target.lastHitTick = s.tick;
  count(s, 'hits', move);
  count(s, 'damage', move, amount);
  s.events.push({
    type: 'hit',
    x: target.x,
    y: target.y,
    playerId: target.id,
    owner: ownerId,
    damage: amount,
    color: move?.coreColor || '#ffffff',
    ...(move ? { move, moveKey: combatMoveKey(s, move) } : {}),
  });
  if (target.hp <= 0) {
    target.dead = true;
    target.deaths++;
    target.lives--;
    target.shielding = false;
    target.respawn = s.mode === 'lives' && target.lives <= 0 ? 0 : 60;
    clearOwned(s, target);
    if (s.mode === 'ctf') {
      if (owner && owner !== target && owner.team !== target.team) owner.kills++;
    } else if (s.teamBattle) recordTeamKill(s, target, owner);
    else if (owner && owner !== target) {
      owner.kills++;
      if (s.mode !== 'hill') owner.score++;
    } else if (s.mode !== 'hill') target.score--;
    s.events.push({
      type: 'kill',
      ...(move ? { moveKey: combatMoveKey(s, move) } : {}),
      x: target.x,
      y: target.y,
      playerId: target.id,
      owner: ownerId,
    });
  }
  return true;
}
function moveObject(s, e) {
  const t = compileMove(e.move).templates[e.templateId],
    p = player(s, e.owner);
  e.previousX = e.x;
  e.previousY = e.y;
  e.previousAngle = e.angle;
  if (features.motion(s, e, t, p, api)) return;
  if (e.anchorIds) {
    const [a, b] = e.anchorIds.map((id) => s.entities.find((o) => o.id === id && !o.removed));
    if (!a || !b) {
      remove(e);
      return;
    }
    e.x = a.x;
    e.y = a.y;
    e.linkTo = { x: b.x, y: b.y };
    e.angle = direction(b.x - a.x, b.y - a.y);
    // Trace again from where the anchors are now.
    features.effectFrame(s, e, t);
    return;
  }
  const active = Math.max(0, e.age - e.arm);
  if (t.motion.kind === 'caster_attached') {
    e.angle =
      e.baseAngle + Math.round(t.motion.sweep * (active / Math.max(1, t.lifetime - t.arm) - 0.5));
    const [dx, dy] = dir(e.angle);
    e.x = q(p.x + dx * t.motion.offset);
    e.y = q(p.y + dy * t.motion.offset);
  } else if (t.motion.kind === 'orbit_owner') {
    e.angle = e.baseAngle + Math.round((active * t.motion.sweep) / 16);
    const [dx, dy] = dir(e.angle);
    e.x = q(p.x + dx * t.motion.offset);
    e.y = q(p.y + dy * t.motion.offset);
  } else if (['linear', 'return_to_owner', 'bounce'].includes(t.motion.kind)) {
    if (t.motion.kind === 'return_to_owner' && active > (t.lifetime - t.arm) / 2)
      e.angle = direction(p.x - e.x, p.y - e.y);
    e.speed = q(clamp(e.speed + t.motion.acceleration, 0.25, 18));
    const [dx, dy] = dir(e.angle),
      nx = q(e.x + dx * e.speed),
      ny = q(e.y + dy * e.speed),
      { width, height } = stateArena(s);
    const blocking = walls(s).filter((w) => !w.objectId || w.objectId !== e.id),
      blocked =
        nx < 20 + e.physicalRadius ||
        nx > width - 20 - e.physicalRadius ||
        ny < 20 + e.physicalRadius ||
        ny > height - 20 - e.physicalRadius ||
        blockedSegment(e.x, e.y, nx, ny, blocking, e.physicalRadius);
    // Bouncing objects end on the first collision after their reflection budget.
    const bouncing = t.motion.kind === 'bounce',
      bounce = bouncing && e.bounces > 0;
    if (blocked && (bouncing || t.terminalOn.wall)) {
      if (bounce) {
        const xBlocked =
          nx < 20 + e.physicalRadius ||
          nx > width - 20 - e.physicalRadius ||
          blockedSegment(e.x, e.y, nx, e.y, blocking, e.physicalRadius);
        e.angle = xBlocked ? 16 - e.angle : -e.angle;
        e.bounces--;
      } else {
        let low = 0,
          high = 1;
        for (let i = 0; i < 12; i++) {
          const mid = (low + high) / 2,
            mx = e.x + (nx - e.x) * mid,
            my = e.y + (ny - e.y) * mid;
          if (
            mx < 20 + e.physicalRadius ||
            mx > width - 20 - e.physicalRadius ||
            my < 20 + e.physicalRadius ||
            my > height - 20 - e.physicalRadius ||
            blockedSegment(e.x, e.y, mx, my, blocking, e.physicalRadius)
          )
            high = mid;
          else low = mid;
        }
        e.x = q(e.x + (nx - e.x) * low);
        e.y = q(e.y + (ny - e.y) * low);
        e.wallContact = true;
      }
    } else {
      e.x = nx;
      e.y = ny;
    }
  }
}
function candidate(e, targetId, kind = 'player') {
  const t = compileMove(e.move).templates[e.templateId];
  return {
    entityId: e.id,
    owner: e.owner,
    ownerLife: e.ownerLife,
    move: e.move,
    familyId: e.familyId,
    targetId,
    targetKind: kind,
    amount: t.damage.amount * e.fatigueScale,
    shield: t.damage.shield * e.fatigueScale,
    policy: t.damage.policy,
    interval: t.damage.interval,
    group: t.damage.group,
    impulse: t.impulse,
    x: e.x,
    y: e.y,
  };
}
function ledgerKey(c) {
  return c.policy === 'impact'
    ? `i:${c.familyId}:${c.targetKind}:${c.targetId}`
    : `e:${c.owner}:${c.ownerLife}:${c.move.name}:${c.group}:${c.targetKind}:${c.targetId}`;
}
function resolveHits(s, candidates) {
  const strongest = new Map();
  for (const c of candidates) {
    const key = ledgerKey(c),
      old = strongest.get(key);
    if (!old || c.amount > old.amount || (c.amount === old.amount && c.entityId < old.entityId))
      strongest.set(key, c);
  }
  for (const [key, c] of [...strongest].sort(
    (a, b) =>
      a[1].entityId - b[1].entityId ||
      (String(a[1].targetId) < String(b[1].targetId)
        ? -1
        : String(a[1].targetId) > String(b[1].targetId)
          ? 1
          : 0),
  )) {
    if (s.hitLedger[key] > s.tick) continue;
    let hit = false;
    if (c.targetKind === 'player') {
      const p = player(s, c.targetId);
      if (!p) continue;
      const [dx, dy] = unit(p.x - c.x, p.y - c.y);
      hit = damagePlayer(s, p, c.amount, dx, dy, c.impulse, c.owner, c.move, c.policy, c.shield);
    } else if (c.targetKind === 'object') {
      const e = s.entities.find((o) => o.id === c.targetId && !o.removed);
      hit = damageEntity(s, e, c.amount, c.owner, c.move);
    } else {
      hit = damageMapObject(s, c.targetId, c.amount) !== false;
    }
    if (hit) s.hitLedger[key] = c.policy === 'impact' ? s.tick + 720 : s.tick + c.interval;
  }
}
/** Destruction is direct removal, matching generated hits without firing terminal effects. */
export function damageEntity(s, target, amount, ownerId, move) {
  if (!target || target.removed || target.maxHp <= 0 || target.owner === ownerId) return false;
  const scale = relationDamageScale(move, player(s, ownerId), player(s, target.owner), s);
  if (scale === 0) return false;
  target.hp = q(Math.max(0, target.hp - amount * scale));
  if (target.hp <= 0) {
    remove(target);
    count(s, 'destructions', move);
    s.events.push({ type: 'destroy', x: target.x, y: target.y, owner: target.owner });
  }
  return true;
}
export function simulateEffects(s) {
  s.actionWork = {};
  const candidates = s.pendingImpacts.filter((c) => c.tick <= s.tick);
  s.pendingImpacts = s.pendingImpacts.filter((c) => c.tick > s.tick);
  const current = s.entities
    .filter((e) => !e.removed && e.bornTick < s.tick)
    .sort((a, b) => a.id - b.id);
  const objectIndex = spatialIndex(
    current
      .filter((e) => e.maxHp > 0)
      .map((e) => ({
        ...e,
        queryRadius: e.solid ? Math.max(e.geometry.length, e.geometry.width) : e.physicalRadius,
      })),
  );
  for (const e of current) {
    const owner = player(s, e.owner);
    if (!owner || owner.dead || owner.life !== e.ownerLife) {
      remove(e);
      continue;
    }
    if (e.removed) continue;
    const t = compileMove(e.move).templates[e.templateId];
    e.age++;
    e.ttl--;
    e.warning = e.age <= e.arm;
    features.effectFrame(s, e, t);
    if (e.age === 1) bindings(s, e, 'spawn');
    if (e.age === e.arm + 1) bindings(s, e, 'armed');
    if (e.age > e.arm) {
      moveObject(s, e);
      if (e.removed) continue;
      bindings(s, e, 'timer');
      bindings(s, e, 'interval');
      const ownCandidates = [];
      let playerContact = false;
      for (const p of s.players) {
        if (
          p.dead ||
          !relationDamageScale(e.move, owner, p, s) ||
          !(
            features.hitPlayer(s, e, p) ??
            (hitEntity(e, p) && !blockedSegment(e.x, e.y, p.x, p.y, walls(s)))
          )
        )
          continue;
        if (t.damage.amount || t.damage.shield || t.impulse) ownCandidates.push(candidate(e, p.id));
        playerContact = true;
        if (!e.contactIds.includes(p.id)) {
          e.contactIds.push(p.id);
          bindings(s, e, 'contact', 'impact');
        }
      }
      // Physical contacts can trigger effects even when the body deals no direct damage.
      if (
        t.damage.amount ||
        t.terminalOn.player ||
        t.events.some((binding) => binding.when === 'contact') ||
        !simulationOptimizations.broadPhase
      ) {
        const reach =
          features.queryReach(e) ??
          Math.max(
            e.force?.radius || 0,
            ...e.geometries.map((g) => Math.max(g.radius, g.length, g.width)),
          ) + 20;
        for (const target of objectIndex.query(e.x, e.y, reach)) {
          if (
            target.id === e.id ||
            target.owner === e.owner ||
            target.removed ||
            !relationDamageScale(e.move, owner, player(s, target.owner), s) ||
            features.objectEligible(s, e, target, api) === false ||
            !(
              features.hitObject(s, e, target) ??
              ((target.solid
                ? hitRect(e, solidRect(target))
                : hitEntity(e, target, target.physicalRadius)) &&
                !blockedSegment(
                  e.x,
                  e.y,
                  target.x,
                  target.y,
                  walls(s).filter((w) => w.entityId !== target.id),
                ))
            )
          )
            continue;
          if (t.damage.amount) ownCandidates.push(candidate(e, target.id, 'object'));
          if (t.terminalOn.player) playerContact = true;
          if (
            t.events.some((binding) => binding.when === 'contact') &&
            !e.contactIds.includes(target.id)
          ) {
            e.contactIds.push(target.id);
            bindings(s, e, 'contact', 'impact');
          }
        }
      }
      // Neutral map bodies use the same geometry and hit-group ledger. The map commits topology next tick.
      if (t.damage.amount || !simulationOptimizations.broadPhase)
        for (const rect of walls(s)) {
          if (
            !rect.objectId ||
            !t.damage.amount ||
            !(
              features.hitMap(e, rect) ??
              (hitRect(e, rect) &&
                !blockedSegment(
                  e.x,
                  e.y,
                  clamp(e.x, rect.x, rect.x + rect.w),
                  clamp(e.y, rect.y, rect.y + rect.h),
                  walls(s).filter((w) => w.objectId !== rect.objectId),
                ))
            )
          )
            continue;
          ownCandidates.push(candidate(e, rect.objectId, 'map'));
        }
      const terminating = e.wallContact || (playerContact && t.terminalOn.player) || e.ttl <= 0;
      const delayed =
        terminating &&
        t.events.some((b) => b.when === 'terminal' && b.actions.some((a) => a.op === 'spawn'));
      if (delayed) for (const c of ownCandidates) s.pendingImpacts.push({ ...c, tick: s.tick + 1 });
      else candidates.push(...ownCandidates);
      if (e.wallContact || (playerContact && t.terminalOn.player)) terminal(s, e, 'impact');
    }
    if (e.ttl <= 0 && !e.removed) terminal(s, e, 'expiry');
  }
  resolveHits(s, candidates);
  for (const p of s.players)
    for (const m of p.loadout) {
      const r = resource(p, m);
      if (
        r.sequence &&
        (r.anchors.some((id) => !s.entities.some((e) => e.id === id && !e.removed)) ||
          (r.link && !s.entities.some((e) => e.id === r.link && !e.removed)))
      )
        clearSequence(s, p, m);
    }
  s.entities = s.entities.filter((e) => !e.removed);
  pruneReservations(s);
  if (s.tick % 120 === 0)
    for (const [key, expiry] of Object.entries(s.hitLedger))
      if (expiry <= s.tick) delete s.hitLedger[key];
}
const api = { basePlacement, player, count, remove };
