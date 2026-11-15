// Survival outranks combat, pickups and objectives, on the same bounds as damage.
import { survivalBounds } from './survival.js';
import { legalFighterPosition, routeOnFloor } from './arena-physics.js';
import { hypot, square } from './exact-math.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function survivalInput(state, player, input, map, walls) {
  if (state.mode !== 'lives' || !state.ring) return input;
  // Anticipate another second of closing and leave room to brake before the edge.
  const bounds = survivalBounds({ ...state, ring: Math.min(280, state.ring + 4) }, 35, map),
    inside = (x, y) => x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  if (
    inside(player.x, player.y) &&
    inside(player.x + (input.x || 0) * 45, player.y + (input.y || 0) * 45)
  )
    return input;
  const goal = {
    x: clamp(player.x, bounds.minX, bounds.maxX),
    y: clamp(player.y, bounds.minY, bounds.maxY),
  };
  // Pick reachable supported floor inside the safe area. Clamping onto a wall or
  // a gap would otherwise leave the bot pushing into it until the ring kills it.
  const candidates = [];
  if (inside(goal.x, goal.y) && legalFighterPosition(map, walls, goal.x, goal.y))
    candidates.push(goal);
  for (let y = 60; y < map.height - 33; y += 40)
    for (let x = 60; x < map.width - 33; x += 40) if (inside(x, y)) candidates.push({ x, y });
  const distances = candidates.map((c) => square(c.x - goal.x) + square(c.y - goal.y)),
    used = candidates.map(() => false);
  for (let round = 0; round < candidates.length; round++) {
    let pick = -1;
    for (let i = 0; i < candidates.length; i++)
      if (!used[i] && (pick < 0 || distances[i] < distances[pick])) pick = i;
    used[pick] = true;
    const destination = candidates[pick];
    if (destination !== goal && !legalFighterPosition(map, walls, destination.x, destination.y))
      continue;
    const path = routeOnFloor(map, walls, player, destination);
    if (!path.length) continue;
    // The routing lattice may snap a clamped point back outside the safe area.
    const last = path[path.length - 1];
    if (!inside(last[0], last[1])) continue;
    const waypoint =
      path.length === 1
        ? [destination.x, destination.y]
        : path[hypot(path[0][0] - player.x, path[0][1] - player.y) > 24 ? 0 : 1];
    const dx = waypoint[0] - player.x - (player.walkMomentumX || 0) * 4,
      dy = waypoint[1] - player.y - (player.walkMomentumY || 0) * 4,
      distance = hypot(dx, dy) || 1;
    return { ...input, x: dx / distance, y: dy / distance, shield: false, dash: false };
  }
  const dx = goal.x - player.x,
    dy = goal.y - player.y,
    distance = hypot(dx, dy) || 1;
  return { ...input, x: dx / distance, y: dy / distance, shield: false, dash: false };
}
