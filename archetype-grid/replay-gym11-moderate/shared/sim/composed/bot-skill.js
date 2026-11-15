// Bot difficulty levels and the deterministic lapses that keep Moderate bots human.
// Lapses are hashed from the match seed, bot id and threat id, so they add no state.

export const BOT_DIFFICULTIES = ['normal', 'moderate', 'hard'];

/** Moderate and Hard bots share tactics; Moderate adds defensive lapses. */
export const tactical = (state) =>
  state.botDifficulty === 'hard' || state.botDifficulty === 'moderate';

export const MODERATE = {
  // Share of threats noticed late, and how many ticks after spawning: 67–167 ms at 30 Hz.
  late: 35,
  reaction: [2, 5],
  // Share of threats the bot never notices.
  missed: 8,
  // Chance in percent that a ready shield, dash or parry is used for a given threat window.
  shield: 80,
  dash: 75,
  parry: 70,
  // Shield and dash decisions are rerolled every few ticks.
  window: 6,
};

function mix(h, value) {
  h = Math.imul(h ^ value, 0x9e3779b1);
  return h ^ (h >>> 15);
}

/** A value in 0..99 for this match, bot and key. */
function roll(state, player, ...keys) {
  let h = mix(0x2545f491, state.seed >>> 0);
  for (const char of String(player.id)) h = mix(h, char.charCodeAt(0));
  for (const key of keys) h = mix(h, key | 0);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}

/** Whether a Moderate bot has noticed this threat yet; other levels see everything at once. */
export function noticed(state, player, entity) {
  if (state.botDifficulty !== 'moderate') return true;
  if (roll(state, player, 1, entity.id) < MODERATE.missed) return false;
  if (roll(state, player, 2, entity.id) >= MODERATE.late) return true;
  const [low, high] = MODERATE.reaction;
  return entity.age >= low + (roll(state, player, 6, entity.id) % (high - low + 1));
}

/** Whether a Moderate bot uses an available defense now. */
export function commits(state, player, kind, key = Math.floor(state.tick / MODERATE.window)) {
  if (state.botDifficulty !== 'moderate') return true;
  const salt = { shield: 3, dash: 4, parry: 5 }[kind];
  return roll(state, player, salt, key) < MODERATE[kind];
}
