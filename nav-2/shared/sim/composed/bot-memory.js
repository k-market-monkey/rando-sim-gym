// Hard-bot memory between ticks of one match, kept outside the hashed match state.
// Rooms, calibration, evidence reconstruction and the gym each advance one state
// object from tick 0, so the same seed and inputs rebuild the same memory and the
// same decisions. Recorded replays step stored inputs and never consult it. A copied
// or restored state starts empty, which the policy treats like a recovery reset.
const memories = new WeakMap();

export function botMemory(state, id) {
  let players = memories.get(state);
  if (!players) memories.set(state, (players = new Map()));
  let memory = players.get(id);
  if (!memory)
    players.set(id, (memory = { life: null, firing: null, failed: [], stall: null, intent: null }));
  return memory;
}

/** Forget routes and recovery after a death, respawn or a copied state. */
export function syncLife(memory, player) {
  const life = `${player.deaths}:${player.dead ? 1 : 0}`;
  if (memory.life === life) return;
  memory.life = life;
  memory.firing = null;
  memory.failed = [];
  memory.stall = null;
  memory.intent = null;
}
