// The HUD's dash label. Dash is locked while something the player owns circles them.
export function dashStatus(me, entities = [], tickRate) {
  if (entities.some((e) => e.owner === me.id && !e.removed && e.motion?.kind === 'orbit_owner'))
    return 'LOCKED';
  return me.dashCooldown > 0 ? (me.dashCooldown / tickRate).toFixed(1) + 'S' : 'READY';
}
