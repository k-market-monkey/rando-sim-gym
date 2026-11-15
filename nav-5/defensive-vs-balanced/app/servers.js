// Only server origins published by this installation can receive player sessions.
export function selectServer(
  registry,
  { requested = null, saved = null, current = null, invite = false } = {},
) {
  const wanted = requested || (invite ? current : saved) || current;
  return (
    registry.find((server) => server.id === wanted) ||
    registry.find((server) => server.id === current) ||
    registry[0]
  );
}
export function serverOrigin(server, origin = globalThis.location.origin) {
  return server?.origin || origin;
}
export function serverInvite(url, code, serverId) {
  const link = new URL(url);
  link.search = '';
  link.searchParams.set('room', code);
  link.searchParams.set('server', serverId);
  return link.href;
}
