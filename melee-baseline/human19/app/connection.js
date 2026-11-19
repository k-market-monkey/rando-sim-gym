import { PROTOCOL_VERSION } from '../shared/protocol/message-constants.js';
import { serverOrigin } from './servers.js';
import {
  readRoomSession,
  saveRoomSession,
  clearRoomSession,
  roomLocation,
} from './room-session.js';

/** Owns transport and session recovery; room, input and UI changes stay with the caller. */
export function createConnection({
  context,
  handlers,
  notify,
  onStatus,
  onReadyChange,
  onReconnect,
  onDisconnect,
  onOffline,
  onMembershipForgotten,
  onSessionReplaced,
  onLatency,
}) {
  let ws,
    id,
    token,
    connectionPromise,
    reconnectTimer,
    connectionReady = false,
    restoringMembership = false,
    latency = 0;

  /**
   * @template {keyof typeof import('../shared/protocol/messages.js').CLIENT_MESSAGES} T
   * @param {T} type
   * @param {Omit<import('zod').input<(typeof import('../shared/protocol/messages.js').CLIENT_MESSAGES)[T]>, 'type'>} [fields]
   */
  function send(type, fields = {}) {
    if (connectionReady && ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type, ...fields }));
    else notify('Reconnecting to the room. Please wait a moment.');
  }
  function rememberMembership() {
    const { room, server } = context();
    if (!room || !id || !token) return;
    saveRoomSession(server, { id, token, room });
    history.replaceState(null, '', roomLocation(location.href, room, server.id));
  }
  function forgetMembership() {
    clearRoomSession(context().server);
    history.replaceState(null, '', roomLocation(location.href, null, context().server?.id));
    onMembershipForgotten();
  }
  function cancelReconnect() {
    clearTimeout(reconnectTimer);
  }
  function reconnect() {
    clearTimeout(reconnectTimer);
    if (connectionReady && ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    onStatus('RECONNECTING…');
    onReadyChange();
    return connect()
      .then(onReconnect)
      .catch(() => {
        clearTimeout(reconnectTimer);
        if (context().room || new URL(location.href).searchParams.has('room'))
          reconnectTimer = setTimeout(reconnect, 2000);
      });
  }
  function connect() {
    if (connectionReady && ws?.readyState === WebSocket.OPEN && id) return Promise.resolve();
    if (connectionPromise) return connectionPromise;
    connectionPromise = new Promise((resolve, reject) => {
      connectionReady = false;
      const requestedRoom =
        context().room || new URL(location.href).searchParams.get('room')?.toUpperCase();
      const saved =
        readRoomSession(context().server, requestedRoom) ||
        (context().room === requestedRoom && id && token
          ? { id, token, room: requestedRoom }
          : null);
      ws = new WebSocket(serverOrigin(context().server).replace(/^http/, 'ws') + '/ws');
      const socket = ws;
      const handshakeTimeout = setTimeout(() => {
        if (!connectionReady && ws === socket) socket.close();
      }, 10000);
      const finish = () => {
        clearTimeout(handshakeTimeout);
        connectionReady = true;
        connectionPromise = null;
        clearTimeout(reconnectTimer);
        onStatus((context().server?.label || 'New York').toUpperCase() + ' · ONLINE');
        resolve();
        onReadyChange();
      };
      let freshIdentity;
      const messageHandlers = {
        ...handlers,
        welcome(m) {
          if (m.protocol !== PROTOCOL_VERSION) {
            location.reload();
            return;
          }
          freshIdentity = { id: m.id, token: m.token || m.sessionToken };
          if (saved) socket.send(JSON.stringify({ type: 'resume', ...saved }));
          else {
            id = freshIdentity.id;
            token = freshIdentity.token;
            finish();
          }
        },
        resumed(m) {
          id = m.id;
          token = m.token;
          restoringMembership = !!m.room;
          if (!m.room) {
            forgetMembership();
            handlers.resumed(m);
            finish();
          }
        },
        resumeFailed(m) {
          clearRoomSession(context().server);
          id = freshIdentity.id;
          token = freshIdentity.token;
          restoringMembership = false;
          handlers.resumeFailed(m);
          finish();
        },
        room(m) {
          handlers.room(m, {
            resuming: restoringMembership,
            finishResume() {
              restoringMembership = false;
              finish();
            },
          });
        },
        pong(m) {
          latency = Math.round(Date.now() - m.at);
          onLatency(latency);
        },
      };
      ws.onmessage = (e) => {
        if (ws !== socket) return;
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (m && Object.hasOwn(messageHandlers, m.type)) messageHandlers[m.type](m);
      };
      ws.onclose = (e) => {
        clearTimeout(handshakeTimeout);
        if (ws !== socket) return;
        connectionReady = false;
        connectionPromise = null;
        onDisconnect();
        onStatus('OFFLINE');
        onOffline();
        if (e.code === 4001) {
          forgetMembership();
          id = null;
          token = null;
          clearTimeout(reconnectTimer);
          onSessionReplaced();
        } else if (context().room || new URL(location.href).searchParams.has('room')) {
          onStatus('RECONNECTING…');
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(reconnect, 750);
        }
        reject(new Error('Could not connect to the server'));
      };
      ws.onerror = () => {
        if (ws !== socket) return;
        onStatus('OFFLINE');
      };
    });
    return connectionPromise;
  }
  function disconnect() {
    const old = ws;
    ws = null;
    old?.close();
    clearTimeout(reconnectTimer);
    connectionReady = false;
    id = null;
    token = null;
    connectionPromise = null;
  }
  function refreshIdentity() {
    if (!ws) return;
    const old = ws;
    // The normal close handler resumes the existing seat; outside a room,
    // reconnect explicitly to pick up the new cookie.
    if (!context().room) old.addEventListener('close', () => reconnect(), { once: true });
    old.close();
  }
  function startPings() {
    setInterval(() => {
      if (connectionReady && ws?.readyState === WebSocket.OPEN) send('ping', { at: Date.now() });
    }, 3000);
  }
  return {
    connect,
    reconnect,
    disconnect,
    refreshIdentity,
    send,
    rememberMembership,
    forgetMembership,
    cancelReconnect,
    startPings,
    get id() {
      return id;
    },
    get token() {
      return token;
    },
    get ready() {
      return connectionReady;
    },
    get open() {
      return ws?.readyState === WebSocket.OPEN;
    },
    get latency() {
      return latency;
    },
  };
}
