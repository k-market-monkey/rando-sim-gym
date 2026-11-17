import { builtinParry } from './bot-builtins.js';
import { noticed } from './bot-skill.js';
import { shieldReady } from './shield.js';
import { allWalls } from './queries.js';
import { hitEntity, blockedSegment, dir } from './geometry.js';
import { projectileDir, usesProjectileHeading } from './projectile-heading.js';
const guardPlans = new WeakMap();
const defend = (input, extra) => ({
  ...input,
  x: 0,
  y: 0,
  cast: -1,
  heldSlots: [],
  pressedSlots: [],
  shoot: false,
  swipe: false,
  dash: false,
  shield: false,
  ...extra,
});
function roll(state, player, key, salt) {
  let h = state.seed >>> 0;
  for (const c of String(player.id)) h = Math.imul(h ^ c.charCodeAt(0), 0x45d9f3b);
  h = Math.imul(h ^ key, 0x85ebca6b);
  h = Math.imul(h ^ salt, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export function meleeAttempt(state, player, start, enemyId) {
  let salt = 31;
  for (const c of String(enemyId)) salt = Math.imul(salt, 31) + c.charCodeAt(0);
  return roll(state, player, start, salt) % 100 < 50;
}
export function moderateDefense(state, player, original) {
  const input = { ...original, shield: false };
  if (player.dead) return input;
  // Cash in a successful parry before the next threat, rather than holding forever.
  if (player.shielding && player.lastParryTick === state.tick) return defend(input, {});
  let plans = guardPlans.get(state);
  if (!plans) guardPlans.set(state, (plans = new Map()));
  const plan = plans.get(player.id);
  if (player.shielding && plan?.life === player.life && state.tick <= plan.until)
    return defend(input, { shield: true });
  const canShield =
    shieldReady(state, player) &&
    !player.swipeRecovery &&
    !Object.values(player.moveResources).some((r) => r.recovery > 0);
  const walls = allWalls(state);
  for (const enemy of state.players) {
    if (enemy === player || enemy.dead || (state.teamBattle && enemy.team === player.team))
      continue;
    const attack = enemy.attack || enemy.swipeAttack;
    if (!attack) continue;
    const move = enemy.attack && enemy.loadout[enemy.attack.slot];
    const root = move?.templates.find((t) => t.id === move.root);
    if (root && root.motion.kind !== 'caster_attached') continue;
    const windup = move ? move.activation.windup : 2;
    const start = state.tick - (windup - attack.remaining);
    const delay = 1 + (roll(state, player, start, 17) % Math.max(1, Math.min(3, windup - 1)));
    if (state.tick - start < delay || !meleeAttempt(state, player, start, enemy.id)) continue;
    const reach = root
      ? Math.max(
          ...root.geometry.map((g) => Math.max(g.radius || 0, g.length || 0, g.width || 0)),
        ) + Math.abs(root.motion.offset)
      : 64;
    const dx = enemy.x - player.x,
      dy = enemy.y - player.y;
    if (
      dx * dx + dy * dy > (reach + 33) * (reach + 33) ||
      blockedSegment(enemy.x, enemy.y, player.x, player.y, walls)
    )
      continue;
    if (canShield) {
      plans.set(player.id, { life: player.life, until: start + windup + 2 });
      return defend(input, { shield: true });
    }
  }
  for (const effect of state.entities.slice(0, 96)) {
    if (
      effect.removed ||
      effect.owner === player.id ||
      effect.age < effect.arm ||
      !noticed(state, player, effect)
    )
      continue;
    const owner = state.players.find((p) => p.id === effect.owner);
    if (state.teamBattle && owner?.team === player.team) continue;
    if (
      !usesProjectileHeading(effect) ||
      !(effect.speed > 0) ||
      !(effect.move.templates.find((t) => t.id === effect.templateId)?.damage.amount > 0)
    )
      continue;
    if (roll(state, player, effect.id, 7) % 100 >= 94) continue;
    const parry = builtinParry(state, player, defend(input, {}), [effect]);
    if (parry) return parry;
    const [dx, dy] = (usesProjectileHeading(effect) ? projectileDir : dir)(effect.angle);
    const endX = effect.x + dx * effect.speed * 3,
      endY = effect.y + dy * effect.speed * 3;
    if (
      canShield &&
      !blockedSegment(effect.x, effect.y, endX, endY, walls, effect.physicalRadius) &&
      hitEntity(
        {
          ...effect,
          previousX: effect.x,
          previousY: effect.y,
          x: endX,
          y: endY,
          previousAngle: effect.angle,
        },
        player,
      )
    )
      return defend(input, { shield: true });
  }
  return input;
}
