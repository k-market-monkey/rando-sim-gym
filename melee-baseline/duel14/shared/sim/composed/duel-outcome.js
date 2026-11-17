// First death fixes the winner; already launched effects settle for one respawn delay.
export const DUEL_SETTLE_TICKS = 60;
export function advanceDuelOutcome(state) {
  const dead = state.players.filter((player) => player.dead);
  for (const player of dead) player.respawn = 0;
  if (state.duelFirstDeathTick === null && dead.length) {
    state.duelFirstDeathTick = state.tick;
    state.duelFirstDeadIds = dead.map((player) => player.id);
  }
  if (state.duelFirstDeathTick !== null) {
    if (state.tick < state.duelFirstDeathTick + DUEL_SETTLE_TICKS) return;
    state.duelEndReason = state.duelFirstDeadIds.length > 1 ? 'simultaneous' : 'first-death';
    state.winner =
      state.duelFirstDeadIds.length === 1
        ? state.players.find((player) => !state.duelFirstDeadIds.includes(player.id)).id
        : null;
    const winner = state.players.find((player) => player.id === state.winner);
    const health = winner && !winner.dead ? winner.hp : 0;
    state.duelScore = winner ? (winner.id === state.players[0].id ? health : -health) : 0;
  } else {
    if (state.tick < state.timeLimit * 30) return;
    const [a, b] = state.players;
    state.duelEndReason = 'timeout';
    state.duelScore = a.hp - b.hp;
    state.winner = state.duelScore > 0 ? a.id : state.duelScore < 0 ? b.id : null;
  }
  state.ended = true;
  state.winners = state.winner ? [state.winner] : [];
}
/** Independent effects may finish after their caster dies; attached bodies cannot. */
export function persistsAfterDeath(state, entity) {
  return (
    state.mode === 'simulation' &&
    !['caster_attached', 'orbit_owner'].includes(entity.motion.kind) &&
    !entity.actor
  );
}

export function duelScoreFor(state, playerId) {
  if (!state.ended) return null;
  return playerId === state.players[0].id ? state.duelScore : -state.duelScore;
}
export function averageDuelScores(scores) {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}
