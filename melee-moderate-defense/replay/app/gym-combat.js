import { clearCompilerCache } from '../shared/sim/composed/compiler.js';
import * as engine from './gym-engine.js';
import { BUILTIN_SHOOT } from '../shared/content/composed/fixtures.js';
import { cancelAttack } from '../shared/sim/composed/runtime.js';
import { configureParry, recordParries, resetParries } from './gym-parry.js';

// Experimental rules belong only to the playable page, never recorded replays.
export function createGymCombat() {
  return {
    configure({ knockbackMultiplier, flinchFrames, parryFrames = 6 }) {
      const impulse = 2 * knockbackMultiplier;
      if (BUILTIN_SHOOT.templates[0].impulse !== impulse) {
        BUILTIN_SHOOT.templates[0].impulse = impulse;
        clearCompilerCache();
      }
      configureParry(parryFrames);
    },
    step: engine.step,
    remaining: () => 0,
    reset: resetParries,
  };
}
