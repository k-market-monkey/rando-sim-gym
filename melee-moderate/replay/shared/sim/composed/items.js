// Item drops: a seeded schedule places items away from every fighter; a touch applies them.
import {
  ITEMS,
  ITEM,
  ITEM_DROP_RATES,
  ITEM_LIFETIME,
  ITEM_RADIUS,
  MAX_ITEMS,
  ITEM_PLAYER_CLEARANCE,
  ITEM_PLACEMENT_TRIES,
} from '../../content/items.js';
import { floorSupports } from '../../content/floor.js';
import { collisionRects, getStateMap } from '../map-state.js';
import { safeSpawnPoint } from '../safe-spawn.js';
import { survivalBounds } from '../survival.js';
import { q, solidRect } from './geometry.js';
import { damagePlayer } from './runtime.js';
import { touchesPickup } from './pickup.js';

const TOTAL_WEIGHT = ITEMS.reduce((sum, item) => sum + item.weight, 0);

/** A 32-bit value fixed by the match seed, the tick and `salt`. */
function roll(s, salt) {
  let h = Math.imul(s.seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(s.tick + 1, 0xc2b2ae35);
  h ^= Math.imul(salt + 1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
function schedule(s) {
  const mean = ITEM_DROP_RATES[s.itemDrops];
  s.nextItemTick = s.tick + Math.floor(mean / 2) + (roll(s, 0) % (mean + 1));
}
/** Turns drops on for a new match when `rate` names a setting other than off. */
export function startItems(s, rate) {
  if (!ITEM_DROP_RATES[rate]) return;
  s.itemDrops = rate;
  s.items = [];
  s.nextItemId = 1;
  schedule(s);
  for (const p of s.players) Object.assign(p, { itemShield: 0, itemSpeed: 0 });
}
/** Walking speed scale from a speed item. */
export const itemPace = (p) => (p.itemSpeed > 0 ? ITEM.speed.percent / 100 : 1);
/** Counts down each fighter's item effects; called once per living fighter per tick. */
export function tickItemEffects(p) {
  if (p.itemShield > 0) p.itemShield--;
  if (p.itemSpeed > 0) p.itemSpeed--;
}
function place(s) {
  const map = getStateMap(s),
    bounds = survivalBounds(s, ITEM_RADIUS, map),
    rules = {
      ...bounds,
      radius: ITEM_RADIUS,
      rects: [
        ...collisionRects(s),
        ...map.hazards,
        ...s.entities.filter((e) => e.solid && !e.removed).map(solidRect),
      ],
      circles: [
        ...s.players
          .filter((p) => !p.dead)
          .map((p) => ({ x: p.x, y: p.y, radius: ITEM_PLAYER_CLEARANCE })),
        ...s.items.map((item) => ({ x: item.x, y: item.y, radius: ITEM_RADIUS })),
      ],
      blocked: (x, y) => !floorSupports(map, x, y, ITEM_RADIUS),
    };
  for (let i = 0; i < ITEM_PLACEMENT_TRIES; i++) {
    const x = q(bounds.minX + ((bounds.maxX - bounds.minX) * (roll(s, 2 * i + 2) % 1024)) / 1023),
      y = q(bounds.minY + ((bounds.maxY - bounds.minY) * (roll(s, 2 * i + 3) % 1024)) / 1023);
    if (safeSpawnPoint(x, y, rules)) return [x, y];
  }
  return null;
}
function choose(s) {
  let pick = roll(s, 1) % TOTAL_WEIGHT;
  for (const item of ITEMS) {
    if (pick < item.weight) return item.id;
    pick -= item.weight;
  }
  return ITEMS[0].id;
}
function apply(s, p, item) {
  const kind = ITEM[item.kind];
  s.events.push({ type: 'item', item: item.kind, x: item.x, y: item.y, playerId: p.id });
  if (kind.heal) p.hp = q(Math.min(p.maxHp, p.hp + (p.maxHp * kind.heal) / 100));
  if (kind.damage)
    damagePlayer(s, p, q((p.maxHp * kind.damage) / 100), 0, 0, 0, null, null, 'item');
  if (item.kind === 'shield') p.itemShield = kind.ticks;
  if (item.kind === 'speed') p.itemSpeed = kind.ticks;
}
/** Expire, pick up in seat order, then drop a new item when one is due. */
export function advanceItems(s) {
  if (!s.items) return;
  for (const item of s.items) item.ttl--;
  s.items = s.items.filter((item) => item.ttl > 0);
  for (const p of s.players) {
    if (p.dead) continue;
    const index = s.items.findIndex((item) => touchesPickup(p, item));
    if (index < 0) continue;
    const [item] = s.items.splice(index, 1);
    apply(s, p, item);
  }
  if (s.tick < s.nextItemTick) return;
  schedule(s);
  if (s.items.length >= MAX_ITEMS) return;
  const position = place(s);
  if (!position) return;
  s.items.push({
    id: s.nextItemId++,
    kind: choose(s),
    x: position[0],
    y: position[1],
    ttl: ITEM_LIFETIME,
  });
}
