import * as engine from '../shared/sim/composed/engine.js';
import { BUILTIN_SHOOT } from '../shared/content/composed/fixtures.js';
import { cancelAttack } from '../shared/sim/composed/runtime.js';

// Experimental rules belong only to the playable page, never recorded replays.
export function createGymCombat() {
  const flinching = new Map();
  let duration = 0;
  function configure({ knockbackMultiplier, flinchFrames }) {
    BUILTIN_SHOOT.templates[0].impulse = 2 * knockbackMultiplier;
    duration = flinchFrames;
    for (const [id, remaining] of flinching) flinching.set(id, Math.min(remaining, duration));
  }
  function step(state, inputs) {
    const effective = { ...inputs };
    for (const player of state.players) {
      const remaining = flinching.get(player.id) || 0;
      if (player.dead) {
        flinching.delete(player.id);
        continue;
      }
      if (!remaining) continue;
      // Walking cannot cancel the shove. Shield and dash remain escape options.
      cancelAttack(state, player);
      player.shootQueued = 0;
      effective[player.id] = {
        ...inputs[player.id],
        x: 0,
        y: 0,
        cast: -1,
        heldSlots: [],
        pressedSlots: [],
        shoot: false,
        swipe: false,
        cancelAttack: true,
      };
      flinching.set(player.id, remaining - 1);
    }
    engine.step(state, effective);
    if (!duration) return;
    for (const event of state.events) {
      if (event.type !== 'hit' || !(event.damage > 0) || event.owner === event.playerId) continue;
      const player = state.players.find((p) => p.id === event.playerId);
      if (!player || player.dead) continue;
      flinching.set(player.id, duration);
      cancelAttack(state, player);
      player.shootQueued = 0;
    }
  }
  return {
    configure,
    step,
    remaining: (id) => flinching.get(id) || 0,
    reset: () => flinching.clear(),
  };
}
