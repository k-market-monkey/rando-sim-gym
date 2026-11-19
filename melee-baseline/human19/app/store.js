import { applyTick } from '../shared/protocol/snapshot.js';

const emptyRound = { round: null, state: null, previousState: null, stateAt: 0 };
const playing = (room) => room && ['playing', 'finished'].includes(room.phase);
const roomView = (room) =>
  !room
    ? 'home'
    : playing(room)
      ? 'match'
      : ['starting', 'banning'].includes(room.phase)
        ? room.phase
        : 'lobby';

/** Consumes server values as immutable snapshots; reads share them without cloning. */
export function createStore({ schedule = (callback) => requestAnimationFrame(callback) } = {}) {
  const frozen = new WeakSet(),
    subscribers = new Set();
  let value = Object.freeze({ room: null, ...emptyRound, view: 'home' }),
    pending = null;

  function readonly(object) {
    if (!object || typeof object !== 'object' || frozen.has(object)) return object;
    frozen.add(object);
    for (const child of Object.values(object)) readonly(child);
    return Object.freeze(object);
  }
  function write(fields, change) {
    value = Object.freeze({ ...value, ...fields });
    if (pending) {
      pending[change] = true;
      return;
    }
    pending = { [change]: true };
    schedule(() => {
      const changes = Object.freeze(pending),
        snapshot = value;
      pending = null;
      for (const subscriber of subscribers) subscriber(snapshot, changes);
    });
  }
  function accepts(message) {
    return (
      playing(value.room) &&
      message.roomCode === value.room.code &&
      message.roundNumber === value.room.roundNumber
    );
  }

  return Object.freeze({
    get: () => value,
    get room() {
      return value.room;
    },
    get round() {
      return value.round;
    },
    get state() {
      return value.state;
    },
    get previousState() {
      return value.previousState;
    },
    get stateAt() {
      return value.stateAt;
    },
    get view() {
      return value.view;
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    setRoom(room) {
      const previousRoom = value.room,
        changed =
          previousRoom?.code !== room.code || previousRoom?.roundNumber !== room.roundNumber,
        reset = changed || !playing(room);
      write({ room: readonly(room), ...(reset ? emptyRound : {}), view: roomView(room) }, 'room');
      return Object.freeze({ previousRoom, room: value.room, changed, reset });
    },
    setRound(round) {
      if (!accepts(round)) return false;
      write({ round: readonly(round) }, 'round');
      return true;
    },
    applyTick(tick, now) {
      if (!accepts(tick)) return null;
      const next = applyTick(value.round, tick);
      if (!next) return null;
      const accepted = Object.freeze({
        state: readonly(next),
        previousState: value.state,
        stateAt: now,
      });
      write(accepted, 'state');
      return accepted;
    },
    appendChat(message) {
      const room = value.room;
      if (!room || (message.roomCode && message.roomCode !== room.code)) return null;
      const chat = room.chat || [],
        added = !chat.some((item) => item.id === message.message.id);
      write(
        {
          room: readonly({ ...room, chat: (added ? [...chat, message.message] : chat).slice(-50) }),
        },
        'chat',
      );
      return Object.freeze({ added });
    },
    applyLatency(message) {
      const room = value.room;
      if (!room || message.roomCode !== room.code) return false;
      write(
        {
          room: readonly({
            ...room,
            players: room.players.map((player) => ({
              ...player,
              pingMs: message.players[player.id] ?? null,
            })),
          }),
        },
        'latency',
      );
      return true;
    },
    clearRoom() {
      write({ room: null, ...emptyRound, view: 'home' }, 'room');
    },
    setView(view) {
      if (view !== value.view) write({ view }, 'view');
    },
  });
}
