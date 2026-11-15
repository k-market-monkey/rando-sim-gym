// These switches change derived work only, never authoritative game rules.
// Node operators can disable all equivalent optimizations for rollback; tests
// can toggle individual paths when comparing cold/warm/evicted caches.
const enabled = globalThis.process?.env?.RANDO_SIMULATION_OPTIMIZATIONS !== '0';
export const simulationOptimizations = {
  navigation: enabled,
  collisionSnapshots: enabled,
  broadPhase: enabled,
};
export function configureSimulationOptimizations(options = {}) {
  for (const key of Object.keys(simulationOptimizations))
    if (typeof options[key] === 'boolean') simulationOptimizations[key] = options[key];
}
