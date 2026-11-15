// Mechanics scenarios for the Composed features: teleport, homing, reflected
// rays, beam reflectors, companions and decoys. Each must be seen to do its job before a move
// that uses it is admitted.
import { createMatch, step, botInput } from '../sim/composed/engine.js';
import { COMPOSED_BASE_MOVES, COMPOSED_FEATURE_MOVES } from '../content/composed/fixtures.js';
import { enemyTargets, teleportDestination } from '../sim/composed/mechanics.js';
import { hypot } from '../sim/exact-math.js';
import { checkDeadline } from './deadline.js';
const harmful = (move) =>
  move.templates.some(
    (t) => t.damage.amount || t.damage.shield || t.impulse || t.force.direction !== 'none',
  );
// Only a harmless, dedicated cover/reflector recipe claims defensive usefulness.
// Offensive mirrors and incidental cover on teleport/actor graphs have their
// own capability checks; they need not protect this owner from this probe angle.
const defensiveUtility = (move) =>
  !harmful(move) &&
  move.casterAction.kind === 'none' &&
  move.templates.every((t) => t.actor.kind === 'none') &&
  move.templates.some((t) => t.solid || t.reflectsBeams);
export const pureUtility = (move) =>
  !harmful(move) &&
  (move.casterAction.kind === 'teleport' ||
    move.templates.some((t) => t.actor.kind === 'decoy') ||
    defensiveUtility(move));
const probe = (move, enemy = COMPOSED_BASE_MOVES[0]) => {
  const state = createMatch({
    players: [
      {
        id: 'candidate',
        name: 'Probe',
        color: '#123456',
        secondaryColor: '#abcdef',
        look: 4,
        loadout: [move],
      },
      { id: 'target', loadout: [enemy] },
    ],
    stage: 'foundry',
    mapRevision: 1,
    mode: 'timed',
    botDifficulty: 'normal',
    swipeEnabled: false,
    shootEnabled: false,
    timeLimit: 60,
    seed: 42013,
  });
  for (const [i, p] of state.players.entries())
    Object.assign(p, {
      x: i ? 500 : 400,
      y: 320,
      hp: 10000,
      maxHp: 10000,
      hardProtection: 0,
      invuln: 0,
      impactRecovery: 0,
      vx: 0,
      vy: 0,
    });
  return state;
};
function fire(move, tick, aimX, aimY) {
  return {
    aimX,
    aimY,
    pressedSlots: tick === 0 ? [0] : [],
    heldSlots: move.activation.mode === 'hold' && tick < 90 ? [0] : [],
  };
}
export function utilityProbeInput(move, _tick, state, input) {
  if (move.casterAction.kind !== 'teleport') return input;
  const p = state.players[0];
  for (const [x, y] of [
    [400, 500],
    [600, 320],
    [200, 320],
  ])
    if (teleportDestination(state, p, move, x, y)) return { ...input, aimX: x, aimY: y };
  return input;
}
/** Compare the same armed component with its removal, then let its lifetime run out.
 * Other candidate objects are removed in both cases so damage, force or a decoy
 * cannot masquerade as damage prevention by this component. No player shields,
 * movement or bot decisions are involved in these capability probes.
 */
function defenseScenario(move, template, enemy, attackKind, guard) {
  const state = probe(move, enemy);
  state.players[1].x = 800;
  let ticks = 0,
    active = null;
  for (let tick = 0; tick < 300 && !active; tick++) {
    guard();
    step(state, { candidate: fire(move, tick, 450, 320) });
    ticks++;
    active = state.entities.find(
      (e) => e.owner === 'candidate' && e.templateId === template.id && e.age > e.arm,
    );
  }
  const name = template.solid ? 'placed-cover-prevents-damage' : 'beam-reflector-prevents-damage';
  if (!active)
    return { ticks, scenario: { name, template: template.id, passed: false, spawned: false } };
  // Keep the actual spawned pose, arm, health and remaining lifetime. The control
  // differs only by the absence of this candidate component.
  state.entities = state.entities.filter((e) => e.id === active.id);
  for (const p of state.players) {
    p.attack = null;
    p.pendingAttack = null;
    p.vx = 0;
    p.vy = 0;
    p.fieldX = 0;
    p.fieldY = 0;
    p.hardProtection = 0;
    p.invuln = 0;
  }
  const protectedState = structuredClone(state),
    protectedComponent = protectedState.entities[0],
    control = structuredClone(state),
    expired = structuredClone(state);
  control.entities = [];
  const shot = (s) => {
    const hp = s.players[0].hp,
      aim = { x: s.players[0].x, y: s.players[0].y };
    for (let tick = 0; tick < enemy.activation.windup + enemy.templates[0].lifetime + 2; tick++) {
      guard();
      step(s, {
        target: {
          aimX: aim.x,
          aimY: aim.y,
          pressedSlots: tick === 0 ? [0] : [],
          heldSlots: enemy.activation.mode === 'hold' && tick === 0 ? [0] : [],
        },
      });
      ticks++;
    }
    return hp - s.players[0].hp;
  };
  const protectedDamage = shot(protectedState),
    controlDamage = shot(control);
  // Exhaustion is natural, not a simulated invulnerability toggle. Stop at the
  // original object's removal; bounded content cannot leave permanent cover.
  for (let tick = 0; tick < 181 && expired.entities.some((e) => e.id === active.id); tick++) {
    guard();
    step(expired);
    ticks++;
  }
  const exhausted = !expired.entities.some((e) => e.id === active.id),
    expiredDamage = shot(expired),
    preventedDamage = controlDamage - protectedDamage;
  return {
    ticks,
    scenario: {
      name,
      template: template.id,
      passed: controlDamage > 0 && preventedDamage > 0 && exhausted && expiredDamage > 0,
      spawned: true,
      attack: enemy.name,
      attackKind,
      componentHealthLost: active.hp - protectedComponent.hp,
      componentPresentAfterAttack: protectedState.entities.some((e) => e.id === active.id),
      protectedDamage,
      controlDamage,
      preventedDamage,
      exhausted,
      expiredDamage,
      remainingLifetime: active.ttl,
      scope: template.solid ? 'stationary placed cover' : 'incoming beam reflection',
    },
  };
}
/** Actual component exercise, separate from duel win rate and structural validation. */
export function componentScenarios({ move, scenarios, stats, deadline }) {
  const guard = () => checkDeadline(deadline);
  let ticks = 0;
  const defense = defensiveUtility(move)
    ? move.templates.filter((t) => t.solid || t.reflectsBeams)
    : [];
  for (const template of defense) {
    const attacks = [[COMPOSED_FEATURE_MOVES.find((m) => m.name === 'bouncing laser'), 'beam']];
    if (template.solid)
      attacks.push([COMPOSED_BASE_MOVES.find((m) => m.name === 'pepper stream'), 'projectile']);
    for (const [enemy, attackKind] of attacks) {
      const result = defenseScenario(move, template, enemy, attackKind, guard);
      ticks += result.ticks;
      scenarios.push(result.scenario);
    }
  }
  if (pureUtility(move)) {
    const activation = scenarios.find((s) => s.name === 'activation-and-usefulness'),
      uses = (stats.teleports || 0) + (stats.decoysSpawned || 0),
      verifiedDefenseChecks = scenarios.filter((s) => s.preventedDamage > 0 && s.passed).length;
    activation.passed = activation.activations > 0 && (uses > 0 || verifiedDefenseChecks > 0);
    activation.utilityActivations = uses;
    activation.verifiedDefenseChecks = verifiedDefenseChecks;
    activation.preventedDamage = scenarios.reduce((sum, s) => sum + (s.preventedDamage || 0), 0);
  }
  const rays = move.templates.filter((t) => t.ray.kind === 'reflect'),
    mirrors = move.templates.filter((t) => t.reflectsBeams);
  if (rays.length) {
    const observed = new Set();
    let bounded = true;
    for (const x of [880, 900, 910]) {
      guard();
      const s = probe(move);
      s.players[0].x = x;
      s.players[1].x = 700;
      for (let tick = 0; tick < 300; tick++) {
        step(s, { candidate: fire(move, tick, 1200, 320) });
        ticks++;
        const reflectors = new Set(
          s.entities.filter((e) => mirrors.some((t) => t.id === e.templateId)).map((e) => e.id),
        );
        for (const e of s.entities.filter((e) => e.owner === 'candidate' && e.raySegments)) {
          const template = rays.find((t) => t.id === e.templateId);
          if (!template) continue;
          const length = e.raySegments.reduce(
              (sum, p) => sum + hypot(p.endX - p.x, p.endY - p.y),
              0,
            ),
            // Turns at the move's own reflectors do not spend wall bounces.
            reflections = e.raySegments.filter((p) => reflectors.has(p.entityId)).length;
          if (e.raySegments.length > 1) observed.add(e.templateId);
          bounded &&=
            length <= template.ray.range + 0.05 &&
            e.raySegments.length <= Math.min(4, template.ray.bounces + 1 + reflections);
        }
      }
    }
    scenarios.push({
      name: 'reflected-ray-path-and-range',
      passed: bounded && rays.every((t) => observed.has(t.id)),
      templates: [...observed],
      bounded,
    });
  }
  if (mirrors.length && !defensiveUtility(move)) {
    // The target fires a reflected ray at the candidate, who stands behind its reflector.
    guard();
    const enemy = COMPOSED_FEATURE_MOVES.find((m) => m.name === 'bouncing laser'),
      s = probe(move, enemy),
      turned = new Set();
    for (let tick = 0; tick < 300; tick++) {
      step(s, {
        candidate: fire(move, tick, 450, 320),
        target: { aimX: 400, aimY: 320, pressedSlots: tick % 100 === 20 ? [0] : [] },
      });
      ticks++;
      for (const ray of s.entities.filter((e) => e.owner === 'target' && e.raySegments))
        for (const segment of ray.raySegments) {
          const mirror = s.entities.find((e) => e.id === segment.entityId);
          if (mirror?.owner === 'candidate' && mirrors.some((t) => t.id === mirror.templateId))
            turned.add(mirror.templateId);
        }
    }
    scenarios.push({
      name: 'beam-reflector-turns-beams',
      passed: mirrors.every((t) => turned.has(t.id)),
      templates: [...turned],
    });
  }
  const guided = move.templates.filter((t) => t.guidance.kind === 'homing');
  if (guided.length) {
    guard();
    const s = probe(move),
      turned = new Set();
    s.players[1].y = 380;
    for (let tick = 0; tick < 300; tick++) {
      step(s, { candidate: fire(move, tick, 700, 320) });
      ticks++;
      for (const e of s.entities)
        if (
          e.owner === 'candidate' &&
          e.angle !== e.previousAngle &&
          guided.some((t) => t.id === e.templateId)
        )
          turned.add(e.templateId);
    }
    scenarios.push({
      name: 'guided-projectile-steering',
      passed: guided.every((t) => turned.has(t.id)),
      templates: [...turned],
    });
  }
  const actor = move.templates.find((t) => t.actor.kind !== 'none');
  if (actor) {
    guard();
    const s = probe(move);
    let body = null,
      moved = false,
      targeted = false,
      chosenByBot = false,
      destroyed = false,
      copied = true,
      hadActor = false;
    const source = s.players[0];
    for (let tick = 0; tick < Math.min(360, move.activation.windup + actor.lifetime + 40); tick++) {
      if (hadActor) {
        source.x = 300;
        source.y = 320;
      }
      const target = s.players[1];
      const before = s.entities.find((e) => e.actor && e.owner === 'candidate');
      if (before) {
        targeted ||= enemyTargets(s, target).some((t) => t.actorId === before.id);
        body ??= { x: before.x, y: before.y, hp: before.hp };
        moved ||= hypot(before.x - body.x, before.y - body.y) > 4;
        copied &&=
          before.actor.appearance.name === source.name &&
          before.actor.appearance.color === source.color &&
          before.actor.appearance.secondaryColor === source.secondaryColor;
      }
      const decision = botInput(s, 'target');
      if (before && hypot(decision.aimX - before.x, decision.aimY - before.y) < 1)
        chosenByBot = true;
      const input =
        hadActor && before
          ? {
              ...decision,
              x: 0,
              y: 0,
              shield: false,
              aimX: before.x,
              aimY: before.y,
              pressedSlots: [0],
              heldSlots: [0],
            }
          : {};
      step(s, { candidate: fire(move, tick, 500, 320), target: input });
      ticks++;
      const after = s.entities.find((e) => e.actor && e.owner === 'candidate');
      if (after) hadActor = true;
      if (before && !after && s.events.some((e) => e.type === 'destroy')) destroyed = true;
    }
    scenarios.push({
      name:
        actor.actor.kind === 'decoy'
          ? 'decoy-visible-targetable-body'
          : 'companion-navigates-and-can-be-countered',
      passed:
        hadActor && targeted && copied && (actor.actor.kind === 'decoy' ? chosenByBot : moved),
      spawned: hadActor,
      targeted,
      chosenByBot,
      copied,
      moved,
      destroyedByProbe: destroyed,
    });
  }
  if (move.casterAction.kind === 'teleport') {
    guard();
    const s = probe(move),
      p = s.players[0],
      from = { x: p.x, y: p.y };
    const intended = teleportDestination(s, p, move, 600, 320);
    let event = null;
    // Exact occupied endpoint cancels before any resource is consumed.
    const blocked = probe(move);
    blocked.players[1].x = 400 + Math.min(100, move.casterAction.range);
    const owner = blocked.players[0];
    for (let tick = 0; tick < move.activation.windup + 3; tick++) {
      step(blocked, { candidate: fire(move, tick, blocked.players[1].x, 320) });
      ticks++;
    }
    for (let tick = 0; tick < move.activation.windup + 3; tick++) {
      step(s, { candidate: fire(move, tick, 600, 320) });
      ticks++;
      event ||= s.events.find((e) => e.type === 'teleport');
    }
    scenarios.push({
      name: 'teleport-repositions-and-rejects-occupied-endpoints',
      passed:
        !!intended &&
        !!event &&
        hypot(p.x - from.x, p.y - from.y) > 20 &&
        owner.moveResources[move.name].uses === 0 &&
        owner.moveResources[move.name].cooldown === 0,
      displacement: hypot(p.x - from.x, p.y - from.y),
      blockedUses: owner.moveResources[move.name].uses,
    });
  }
  return ticks;
}
