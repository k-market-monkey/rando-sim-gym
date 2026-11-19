import { dir, blockedSegment } from '../shared/sim/composed/geometry.js';

// Same centered body used by generated attacks and wall collision in this gym.
export const PLAYER_BODY_RADIUS = 13;

/** A target circle touching any part of a forward 90-degree sector. */
export function circleTouchesSwipe(attacker, target, angle, range, radius, walls = []) {
  const x = target.x - attacker.x,
    y = target.y - attacker.y;
  const distanceSquared = x * x + y * y;
  if (distanceSquared > (range + radius) * (range + radius)) return false;
  const [dx, dy] = dir(angle),
    length = Math.sqrt(dx * dx + dy * dy);
  const along = (x * dx + y * dy) / length;
  const across = (-x * dy + y * dx) / length;
  let touches = along >= Math.abs(across);
  if (!touches) {
    const edge = range / Math.sqrt(2);
    for (const sign of [-1, 1]) {
      const projection = Math.max(
        0,
        Math.min(1, (along * edge + across * edge * sign) / (range * range)),
      );
      const ex = along - projection * edge,
        ey = across - projection * edge * sign;
      if (ex * ex + ey * ey <= radius * radius) {
        touches = true;
        break;
      }
    }
  }
  return touches && !blockedSegment(attacker.x, attacker.y, target.x, target.y, walls);
}
