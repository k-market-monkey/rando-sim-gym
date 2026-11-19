import { projectileDir, projectileDirection } from './projectile-heading.js';
import { q } from './geometry.js';
// Policy-only memory: recorded games step captured inputs, never rerun the bot.
const memories = new WeakMap();
export const HUMAN_BOT = { reaction: [6, 12], aimErrorDegrees: 3 };
function roll(state, player, index, salt) {
  let h = state.seed >>> 0;
  for (const c of String(player.id)) h = Math.imul(h ^ c.charCodeAt(0), 0x45d9f3b);
  h = Math.imul(h ^ index, 0x85ebca6b);
  h = Math.imul(h ^ salt, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export function reactionFrames(state, player, index) {
  return 6 + (roll(state, player, index, 1) % 7);
}
export function aimErrorDegrees(state, player, index) {
  return ((roll(state, player, index, 2) % 6001) - 3000) / 1000;
}
export function humanBotInput(state, player, decide) {
  let bots = memories.get(state);
  if (!bots) memories.set(state, (bots = new Map()));
  let memory = bots.get(player.id);
  if (!memory || memory.life !== player.life) {
    memory = {
      life: player.life,
      index: 0,
      next: state.tick + reactionFrames(state, player, 0),
      input: { x: 0, y: 0, aimX: player.aimX, aimY: player.aimY, heldSlots: [], pressedSlots: [] },
    };
    bots.set(player.id, memory);
  }
  if (state.tick >= memory.next) {
    const input = JSON.parse(JSON.stringify(decide()));
    input.shield = false;
    if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
      const x = input.aimX - player.x,
        y = input.aimY - player.y,
        distance = Math.sqrt(x * x + y * y);
      const angle =
        projectileDirection(x, y) + (aimErrorDegrees(state, player, memory.index) * 32) / 360;
      const [dx, dy] = projectileDir(angle);
      input.aimX = q(player.x + dx * distance);
      input.aimY = q(player.y + dy * distance);
    }
    memory.input = input;
    memory.index++;
    memory.next = state.tick + reactionFrames(state, player, memory.index);
  }
  const result = structuredClone(memory.input);
  memory.input = {
    ...memory.input,
    pressedSlots: [],
    dash: false,
    shoot: false,
    swipe: false,
    cast: -1,
  };
  return result;
}

export function resetHumanBots(state) {
  memories.delete(state);
}
