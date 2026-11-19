import { MAX_WIDTH, MAX_HEIGHT } from '../shared/content/arena.js';
import { EMOTES } from '../shared/content/emotes.js';
// Edges are acknowledged and retained across network packets; holding is sampled.
const finite = (v, min, max) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0);
const emoteNumber = (n) => (Number.isInteger(n) && n >= 1 && n <= EMOTES.length ? n : 0);
export function receiveInput(previous, raw = {}, now = Date.now()) {
  const packet = {
    x: finite(raw.x, -1, 1),
    y: finite(raw.y, -1, 1),
    // The engine clamps aim again to the round's arena.
    aimX: finite(raw.aimX, 0, MAX_WIDTH),
    aimY: finite(raw.aimY, 0, MAX_HEIGHT),
    shield: !!raw.shield,
    dash: !!raw.dash || !!previous?.dash,
    // One emote waits for the next tick, like a dash press.
    emote: emoteNumber(raw.emote) || previous?.emote || 0,
    cast: Number.isInteger(raw.cast) && raw.cast >= 0 && raw.cast < 5 ? raw.cast : -1,
    received: now,
    heldSlots: [
      ...new Set(
        (Array.isArray(raw.heldSlots) ? raw.heldSlots : []).filter(
          (n) => Number.isInteger(n) && n >= 0 && n < 5,
        ),
      ),
    ],
    queue: [...(previous?.queue || [])],
    ack: previous?.ack || 0,
  };
  if (raw.cancelAttacks) {
    packet.queue = [];
    packet.heldSlots = [];
    packet.dash = false;
    packet.emote = 0;
    packet.cast = -1;
  }
  for (const press of (Array.isArray(raw.presses) ? raw.presses : []).slice(0, 16)) {
    if (
      !Number.isSafeInteger(press?.seq) ||
      press.seq <= packet.ack ||
      press.seq > packet.ack + 1000 ||
      !(
        (Number.isInteger(press.slot) &&
          press.slot >= 0 &&
          press.slot < 5 &&
          !Object.hasOwn(press, 'action')) ||
        // A client loaded before the rename still sends 'melee'.
        (['swipe', 'melee', 'shoot'].includes(press.action) && !Object.hasOwn(press, 'slot'))
      )
    )
      continue;
    if (packet.queue.length >= 16) break;
    packet.ack = press.seq;
    if (!raw.cancelAttacks)
      packet.queue.push(
        Object.hasOwn(press, 'action')
          ? press.action === 'shoot'
            ? 'shoot'
            : 'swipe'
          : press.slot,
      );
  }
  return packet;
}
export function consumeInput(packet, now = Date.now()) {
  if (!packet) return { x: 0, y: 0, cast: -1, heldSlots: [], pressedSlots: [] };
  if (now - packet.received >= 300) {
    packet.queue = [];
    packet.heldSlots = [];
    packet.dash = false;
    packet.emote = 0;
    packet.cast = -1;
    return { x: 0, y: 0, cast: -1, heldSlots: [], pressedSlots: [] };
  }
  const press = packet.queue.shift();
  const input = { ...packet, pressedSlots: Number.isInteger(press) ? [press] : [] };
  if (press === 'swipe') input.swipe = true;
  if (press === 'shoot') input.shoot = true;
  delete input.queue;
  delete input.ack;
  delete input.received;
  if (!input.emote) delete input.emote;
  packet.cast = -1;
  packet.dash = false;
  packet.emote = 0;
  return input;
}
