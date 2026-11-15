// Practice remains a server-backed room workflow, with no separate simulation.
export function createPracticeFlow({ store, send }) {
  let practice = null;
  function advancePractice() {
    if (!practice || !store.room) return;
    if (practice === 'creating') {
      practice = 'adding';
      send({ type: 'addBot' });
      send({ type: 'ready' });
    } else if (
      practice === 'adding' &&
      store.room.players.length >= 2 &&
      store.room.players.every((p) => p.ready)
    ) {
      practice = null;
      send({ type: 'start' });
    }
  }
  return {
    start() {
      practice = 'creating';
    },
    reset() {
      practice = null;
    },
    advance: advancePractice,
  };
}
