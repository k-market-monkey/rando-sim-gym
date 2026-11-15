/** Frozen controls layered over the bot supplied by the named engine build.
 * Never edit this revision: introduce a new revision when style behavior changes.
 */
export const COMPOSED_INPUT_POLICY_REVISION = 'composed-styles-v1';
export const COMPOSED_INPUT_STYLES = Object.freeze(['balanced', 'aggressive', 'defensive']);
export function composedPolicyInput(engine, state, id, policy) {
  if (
    policy?.revision !== COMPOSED_INPUT_POLICY_REVISION ||
    !COMPOSED_INPUT_STYLES.includes(policy.style)
  )
    throw Error('Unknown calibration input policy');
  const input = engine.botInput(state, id);
  if (policy.style === 'aggressive') return { ...input, shield: false };
  if (policy.style === 'defensive' && state.tick % 120 < 12)
    return { ...input, shield: true, pressedSlots: [], heldSlots: [] };
  return input;
}
