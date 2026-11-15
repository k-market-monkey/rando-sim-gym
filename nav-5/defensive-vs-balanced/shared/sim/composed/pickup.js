import { ITEM_RADIUS } from '../../content/items.js';
import { square } from '../exact-math.js';
/** The existing item touch geometry, shared by bounded flag objectives. */
export const touchesPickup = (player, pickup) =>
  square(pickup.x - player.x) + square(pickup.y - player.y) <= square(ITEM_RADIUS + 13);
