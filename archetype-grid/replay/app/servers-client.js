import { selectServer, serverOrigin } from './servers.js';

/** Owns registry discovery, region pings and server selection without connection side effects. */
export function createServersClient() {
  let serverRegistry = [],
    selectedServer = null,
    serverPings = {},
    replayServers = new Set(),
    creationServerId = null;

  async function initialize() {
    try {
      const response = await fetch('/api/servers');
      if (!response.ok) throw Error();
      const data = await response.json();
      serverRegistry = data.servers.map((server) => ({
        ...server,
        origin: server.origin || location.origin,
      }));
      const query = new URLSearchParams(location.search);
      let saved;
      try {
        saved = localStorage.getItem('rando.server');
      } catch {}
      selectedServer = selectServer(serverRegistry, {
        requested: query.get('server'),
        saved,
        current: data.current,
        invite: query.has('room'),
      });
      creationServerId = selectServer(serverRegistry, {
        requested: query.has('room') ? null : query.get('server'),
        saved,
        current: data.current,
      }).id;
    } catch {
      serverRegistry = [
        { id: 'us-east', label: 'New York', region: 'nyc3', origin: location.origin },
      ];
      selectedServer = serverRegistry[0];
      creationServerId = selectedServer.id;
    }
  }

  async function measure() {
    await Promise.allSettled(
      serverRegistry.map(async (server) => {
        try {
          await fetch(serverOrigin(server) + '/api/health', { signal: AbortSignal.timeout(5000) });
          const start = performance.now();
          const response = await fetch(serverOrigin(server) + '/api/health', {
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            serverPings[server.id] = Math.round(performance.now() - start);
            const health = await response.json();
            if (health.replays?.enabled) replayServers.add(server.id);
            else replayServers.delete(server.id);
          }
        } catch {}
      }),
    );
  }

  return {
    initialize,
    measure,
    get registry() {
      return serverRegistry.map((server) => ({ ...server }));
    },
    get selected() {
      return selectedServer ? { ...selectedServer } : null;
    },
    get creationServerId() {
      return creationServerId;
    },
    supportsReplays(serverId) {
      return replayServers.has(serverId);
    },
    ping(serverId) {
      return serverPings[serverId];
    },
    select(serverId) {
      const target = serverRegistry.find((server) => server.id === serverId);
      if (!target) return false;
      selectedServer = target;
      return true;
    },
    setCreationServer(serverId) {
      const target = serverRegistry.find((server) => server.id === serverId);
      if (!target) return false;
      creationServerId = target.id;
      try {
        localStorage.setItem('rando.server', target.id);
      } catch {}
      return true;
    },
  };
}
