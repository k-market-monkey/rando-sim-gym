// The built-in shield: held to block, drains while raised and recharges while
// lowered. A broken shield stays locked until it is full again.
import { q } from './geometry.js';

export const SHIELD = Object.freeze({
  drain: 2.5,
  recharge: 3,
  // Ticks after lowering during which the player cannot attack or dash.
  release: 8,
  // Shielded hits keep a quarter of their knockback.
  knockback: 0.25,
  // Ticks after lowering or breaking before the shield can be raised again.
  cooldown: 15,
  // Ticks from raising, the first included, in which a block costs no shield
  // and cancels the knockback.
  perfect: 5,
});

export function resetShield(p) {
  p.shield = 100;
  p.shielding = false;
  p.shieldLocked = false;
  p.shieldRelease = 0;
  p.shieldCooldown = 0;
  p.shieldPerfect = 0;
}

function lower(s, p) {
  p.shielding = false;
  p.shieldRelease = s.shieldReleaseFrames ?? SHIELD.release;
  p.shieldCooldown = s.shieldRearmFrames ?? SHIELD.cooldown;
  p.shieldPerfect = 0;
}
function breakShield(s, p) {
  p.shieldLocked = true;
  lower(s, p);
  s.events.push({ type: 'shieldbreak', x: p.x, y: p.y, playerId: p.id });
}

/** Whether a held shield input keeps the shield up, or raises it, this tick. */
export function shieldReady(s, p) {
  return (
    s.shieldEnabled !== false &&
    !p.dead &&
    !p.shieldLocked &&
    p.shield > 0 &&
    p.dashTicks === 0 &&
    (p.shielding || p.shieldCooldown === 0)
  );
}

/** Raises or lowers the shield from this tick's input. Returns whether it is up. */
export function raiseShield(s, p, input) {
  const wasShielding = p.shielding;
  p.shieldCooldown = Math.max(0, p.shieldCooldown - 1);
  p.shieldPerfect = Math.max(0, p.shieldPerfect - 1);
  const shielding = !!input.shield && shieldReady(s, p);
  if (wasShielding && !shielding) lower(s, p);
  if (!wasShielding && shielding) {
    p.shielding = true;
    p.shieldPerfect = SHIELD.perfect;
  }
  return p.shielding;
}

/** Drains a raised shield or recharges a lowered one. */
export function holdShield(s, p) {
  if (p.shielding) {
    p.shield = q(Math.max(0, p.shield - SHIELD.drain));
    if (p.shield === 0) breakShield(s, p);
    return;
  }
  p.shield = q(Math.min(100, p.shield + SHIELD.recharge));
  if (p.shield === 100) p.shieldLocked = false;
}

/** Absorbs a hit on a raised shield and returns the shield damage taken. A
 * perfect block takes none and cancels the knockback. */
export function blockHit(s, target, shieldDamage, kx, ky, impulse) {
  if (target.shieldPerfect > 0) {
    s.telemetry.shield ??= {};
    s.telemetry.shield.perfectBlocks = (s.telemetry.shield.perfectBlocks || 0) + 1;
    s.events.push({ type: 'perfect-block', x: target.x, y: target.y, playerId: target.id });
    return 0;
  }
  target.shield = q(Math.max(0, target.shield - shieldDamage));
  target.vx = q(target.vx + kx * impulse * SHIELD.knockback);
  target.vy = q(target.vy + ky * impulse * SHIELD.knockback);
  if (target.shield === 0) breakShield(s, target);
  return shieldDamage;
}
