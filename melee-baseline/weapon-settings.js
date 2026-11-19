// Each control points at the actual component on the cloned move definition.
export function weaponFields(move) {
  const root = move.templates.find((t) => t.id === move.root),
    shape = root.geometry[0];
  const field = (key, label, target, property, min, max, step = 1) => ({
    key,
    label,
    target,
    property,
    min,
    max,
    step,
  });
  return [
    field('damage', 'Damage (HP)', root.damage, 'amount', 0, 38, 0.5),
    field('shieldDamage', 'Shield damage', root.damage, 'shield', 0, 48, 0.5),
    field('impulse', 'Knockback', root, 'impulse', 0, 16, 0.5),
    field('windup', 'Windup (frames)', move.activation, 'windup', 3, 30),
    field('active', 'Active frames', root, 'lifetime', 1, 120),
    field('recovery', 'Recovery (frames)', move.activation, 'recovery', 0, 45),
    field('cooldown', 'Cooldown (frames)', move.resource, 'cooldown', 3, 180),
    field(
      'radius',
      shape.kind === 'capsule' ? 'Blade radius' : 'Hit radius',
      shape,
      'radius',
      shape.kind === 'sector' ? shape.innerRadius + 1 : 1,
      100,
    ),
    field('offset', 'Blade offset', root.motion, 'offset', 0, 100),
    ...(shape.kind === 'capsule'
      ? [field('length', 'Blade length', shape, 'length', 1, 100)]
      : [
          field('arc', 'Arc (32 = full circle)', shape, 'arc', 1, 32),
          field('sweep', 'Sweep (32 = full turn)', root.motion, 'sweep', -16, 16),
        ]),
    ...(move.casterAction.kind === 'lunge'
      ? [field('range', 'Lunge distance', move.casterAction, 'range', 24, 160)]
      : []),
  ];
}
