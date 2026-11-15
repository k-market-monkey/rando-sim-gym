/** Frozen style revisions layered over the bot supplied by the named build. */
import { shieldReady } from '../sim/composed/shield.js';
export const COMPOSED_LEGACY_INPUT_POLICY_REVISION = 'composed-styles-v1';
export const COMPOSED_INPUT_POLICY_REVISION = 'composed-builtins-styles-v2';
export const COMPOSED_INPUT_STYLES = Object.freeze(['balanced', 'aggressive', 'defensive']);
export const knownComposedInputPolicy = (revision) =>
  revision === COMPOSED_LEGACY_INPUT_POLICY_REVISION || revision === COMPOSED_INPUT_POLICY_REVISION;
export function composedPolicyInput(engine, state, id, policy) {
  if (!knownComposedInputPolicy(policy?.revision) || !COMPOSED_INPUT_STYLES.includes(policy.style))
    throw Error('Unknown calibration input policy');
  const input = engine.botInput(state, id);
  if (policy.style === 'aggressive') return { ...input, shield: false };
  if (policy.style === 'defensive' && state.tick % 120 < 12) {
    // Keep the historical wrapper exact for preserved replay inputs.
    if (policy.revision === COMPOSED_LEGACY_INPUT_POLICY_REVISION)
      return { ...input, shield: true, pressedSlots: [], heldSlots: [] };
    const player = state.players.find((p) => p.id === id);
    if (player && shieldReady(state, player))
      return {
        ...input,
        shield: true,
        dash: false,
        swipe: false,
        shoot: false,
        pressedSlots: [],
        heldSlots: [],
      };
  }
  return input;
}
