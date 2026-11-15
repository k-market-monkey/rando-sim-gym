/** Member status describes the next-round draft; readiness and spectators win. */
export function memberStateLabel(player) {
  if (player.reconnecting) return 'RECONNECTING…';
  if (player.queued === false) return 'WATCHING';
  if (player.ready) return '● READY';
  return player.generating ? '○ GENERATING' : '○ PICKING';
}
