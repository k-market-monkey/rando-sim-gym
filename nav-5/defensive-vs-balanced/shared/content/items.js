// Item drops: what spawns, how often and what each item does on touch.
// Health amounts are percent of the toucher's maximum health; times are ticks.

/** Mean ticks between drops for each room setting; each gap is 0.5 to 1.5 times it. */
export const ITEM_DROP_RATES = Object.freeze({ off: 0, rare: 600, normal: 360, frequent: 180 });
/** Ticks an untouched item stays. */
export const ITEM_LIFETIME = 300;
/** Ticks before an item vanishes during which it blinks. */
export const ITEM_WARNING = 60;
/** Pickup radius; a fighter touches an item within this plus its own radius. */
export const ITEM_RADIUS = 10;
/** Items on the floor at once. */
export const MAX_ITEMS = 3;
/** An item spawns at least this far from every living fighter's centre. */
export const ITEM_PLAYER_CLEARANCE = 140;
/** Random points tried for each drop; the drop is skipped if none is safe. */
export const ITEM_PLACEMENT_TRIES = 8;

/**
 * weight  relative spawn chance: common 6, uncommon 3, rare 1.
 * heal    percent of maximum health restored.
 * damage  percent of maximum health dealt, like a hit with no owner.
 * ticks   how long the effect lasts.
 * percent walking speed while the effect lasts.
 */
export const ITEMS = Object.freeze(
  [
    { id: 'health', weight: 6, heal: 30 },
    { id: 'shield', weight: 3, ticks: 120 },
    { id: 'speed', weight: 3, ticks: 180, percent: 130 },
    { id: 'poison', weight: 1, damage: 15 },
  ].map((item) => Object.freeze(item)),
);
export const ITEM = Object.freeze(Object.fromEntries(ITEMS.map((item) => [item.id, item])));
