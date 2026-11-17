export const roomKey = (serverId, code) =>
  encodeURIComponent(serverId) + ':' + encodeURIComponent(code);

/** Public directory requests use only installation-registry origins, never room-supplied URLs. */
export async function fetchRoomDirectory(
  registry,
  { fetchImpl = globalThis.fetch, timeoutMs = 4000 } = {},
) {
  const results = await Promise.allSettled(
    registry.map(async (server) => {
      const origin = new URL(server.origin);
      if (
        !['http:', 'https:'].includes(origin.protocol) ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash
      )
        throw Error('Invalid server origin');
      const response = await fetchImpl(origin.origin + '/api/rooms', {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw Error('Room list unavailable');
      const data = await response.json();
      if (!Array.isArray(data.rooms)) throw Error('Invalid room list');
      return data.rooms
        .slice(0, 100)
        .filter(
          (room) =>
            room &&
            typeof room === 'object' &&
            /^[A-Z0-9]{6}$/.test(room.code) &&
            Number.isFinite(room.memberCount),
        )
        .map((room) => ({
          ...room,
          key: roomKey(server.id, room.code),
          serverId: server.id,
          serverLabel: server.label,
          serverRegion: server.region,
          serverOrigin: origin.origin,
        }));
    }),
  );
  return {
    rooms: results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
    errors: results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [{ serverId: registry[index].id, label: registry[index].label }]
        : [],
    ),
  };
}

export function filterRoomDirectory(rooms, serverId = 'all') {
  return serverId === 'all' ? rooms : rooms.filter((room) => room.serverId === serverId);
}

export function directoryStatus({
  rooms = [],
  errors = [],
  registry = [],
  filter = 'all',
  loading = false,
} = {}) {
  const visible = filterRoomDirectory(rooms, filter),
    failures = errors.filter((error) => filter === 'all' || error.serverId === filter),
    region = registry.find((server) => server.id === filter);
  if (failures.length)
    return (
      failures.map((error) => error.label).join(', ') +
      (failures.length > 1 ? ' are' : ' is') +
      ' unavailable. ' +
      (visible.length ? 'Other rooms are listed below.' : 'Try refreshing or use an invite link.')
    );
  if (loading && !visible.length) return 'Checking ' + (region?.label || 'all servers') + '…';
  return `${visible.length} ${visible.length === 1 ? 'room' : 'rooms'} · ${region?.label || 'All servers'}`;
}
