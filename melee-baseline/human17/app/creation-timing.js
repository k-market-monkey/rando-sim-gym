// Best effort only: reporting must never hold the catalog, editor or ready button.
export function reportCreationReady(context, measurement) {
  try {
    void fetch(context.origin + '/api/moves/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}` },
      body: JSON.stringify({
        ...measurement,
        room: context.room,
        playerId: context.playerId,
        mechanicsVersion: context.mechanicsVersion,
      }),
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch {
    /* Telemetry is optional even when fetch/storage is unavailable. */
  }
}
