// Sustained caster-origin fire must not repeatedly explode on its caster.
// Actors and caster-center rays are also self-safe; planted bombs
// and muzzle rays with returning reflections may keep deliberate self damage.
export function requiresSafeSelfDamage(move) {
  const root = move?.templates?.find((template) => template.id === move.root);
  return (
    move?.formatVersion >= 2 &&
    ((move.activation?.mode === 'hold' &&
      ['caster_center', 'caster_muzzle'].includes(root?.origin)) ||
      (move.formatVersion >= 3 &&
        (move.templates?.some((template) =>
          ['companion', 'decoy'].includes(template.actor?.kind),
        ) ||
          (root?.origin === 'caster_center' && root.ray?.kind === 'reflect'))))
  );
}
export function generatedSelfDamagePolicy(move) {
  return move.selfDamage && requiresSafeSelfDamage(move) ? { ...move, selfDamage: false } : move;
}
export function selfDamageEnabled(move, state = {}) {
  return (
    (move?.selfDamage === true || move?.selfDamagePolicy === 'color') &&
    !(state.selfDamageRulesRevision >= 2 && requiresSafeSelfDamage(move))
  );
}
