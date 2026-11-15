// Keep recovery credentials in this tab and scoped to the actual regional server.
// Invite URLs contain only the public room code and server, never a credential.
const key = (server) => `rando.room-session:${server.id}:${server.origin}`;
export function readRoomSession(server, room, storage) {
  try {
    storage ??= globalThis.sessionStorage;
    const saved = JSON.parse(storage.getItem(key(server)));
    if (
      !room ||
      saved?.room !== room ||
      typeof saved.id !== 'string' ||
      !saved.id ||
      typeof saved.token !== 'string' ||
      !saved.token
    )
      return null;
    return { id: saved.id, token: saved.token, room: saved.room };
  } catch {
    return null;
  }
}
export function saveRoomSession(server, session, storage) {
  try {
    (storage ?? globalThis.sessionStorage).setItem(
      key(server),
      JSON.stringify({ id: session.id, token: session.token, room: session.room }),
    );
  } catch {}
}
export function clearRoomSession(server, storage) {
  try {
    (storage ?? globalThis.sessionStorage).removeItem(key(server));
  } catch {}
}
export function roomLocation(url, room, serverId) {
  const next = new URL(url);
  if (room) next.searchParams.set('room', room);
  else next.searchParams.delete('room');
  if (serverId) next.searchParams.set('server', serverId);
  return next.href;
}
