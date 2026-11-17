import { TEAMS, teamStandings } from '../shared/sim/teams.js';
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let timer;
export function postgameTitle(state, id) {
  if (state.teamBattle) {
    const winner = TEAMS.find((team) => team.id === state.winnerTeam);
    if (!winner) return 'IT’S A DRAW.';
    return state.winners?.includes(id) ||
      state.players.some((p) => p.id === id && p.team === winner.id)
      ? 'YOUR TEAM WINS.'
      : `${winner.label.toUpperCase()} TEAM WINS.`;
  }
  const winner = state.players.find((p) => p.id === state.winner);
  return winner
    ? winner.id === id
      ? 'YOU WIN.'
      : winner.name.toUpperCase() + ' WINS.'
    : 'IT’S A DRAW.';
}
export function postgameRows(state) {
  if (state.teamBattle)
    return teamStandings(state)
      .sort((a, b) =>
        state.mode === 'lives' ? b.lives - a.lives || b.hp - a.hp : b.score - a.score,
      )
      .map((team) => ({
        id: team.id,
        name: `${team.label} team`,
        color: team.color,
        members: state.players
          .filter((p) => team.playerIds.includes(p.id))
          .map((p) => p.name)
          .join(', '),
        result:
          state.mode === 'lives'
            ? `${team.lives} lives · ${Math.round(team.hp)} HP`
            : `${state.mode === 'hill' ? Math.floor(team.score / 30) : team.score} ${state.mode === 'ctf' ? 'captures' : 'points'}`,
      }));
  return [...state.players]
    .sort((a, b) => (state.mode === 'lives' ? b.lives - a.lives : b.score - a.score))
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      members: '',
      result:
        state.mode === 'lives'
          ? p.lives + ' lives'
          : state.mode === 'hill'
            ? Math.floor(p.score / 30) + ' points'
            : p.score + ' kills',
    }));
}
export function renderPostgame({ root, state, room, id, send, leave, replayOrigin = '' }) {
  const eligible = room?.replayEligibleIds || [],
    votes = room?.replayVotes || {};
  const key = JSON.stringify([
    room?.code,
    room?.roundNumber,
    room?.hostId,
    eligible,
    votes,
    room?.replayDeadline,
    room?.replayId,
  ]);
  if (root.querySelector('#results')?.dataset.key === key) return;
  clearInterval(timer);
  const canReplay = eligible.includes(id),
    voted = votes[id] === 'replay';
  const participants = state.players.filter((p) => eligible.includes(p.id));
  root.innerHTML = `<div class="result-overlay" id="results"><div class="eyebrow">ROUND COMPLETE</div><h2>${esc(postgameTitle(state, id))}</h2><div class="results-list">${postgameRows(
    state,
  )
    .map(
      (p, i) =>
        `<div class="result-row"><span style="color:${esc(p.color)}">${i + 1}. ${esc(p.name)}${p.members ? `<small style="display:block;font-size:10px;line-height:1.7">${esc(p.members)}</small>` : ''}</span><span>${esc(p.result)}</span></div>`,
    )
    .join(
      '',
    )}</div><div class="postgame-votes">${participants.map((p) => `<span class="postgame-vote ${votes[p.id] === 'replay' ? 'selected' : ''}">${esc(p.name)} · ${votes[p.id] === 'replay' ? 'Replay' : 'Deciding'}</span>`).join('')}</div><p class="postgame-status" role="status">${room?.replayDeadline ? 'Replay in <strong id="replay-countdown">5</strong>s' : canReplay ? 'Choose Replay to start a 5-second vote. Play starts sooner if everyone agrees.' : 'The previous fighters can replay. Return to the lobby to prepare a new game.'}</p><div class="postgame-actions">${canReplay ? `<button class="button primary" id="replay-vote" ${voted ? 'disabled' : ''}>${voted ? '✓ REPLAY SELECTED' : 'REPLAY SAME GAME'}</button>` : ''}<button class="button subtle" id="return-lobby">RETURN TO LOBBY</button><button class="back-link" id="results-leave">EXIT ROOM</button></div>${room?.replayId ? `<p><a id="watch-replay" class="back-link" href="${esc(replayOrigin)}/replay.html?id=${encodeURIComponent(room.replayId)}" target="_blank" rel="noopener noreferrer">Watch replay →</a></p>` : ''}<p class="helper">Replay keeps this round’s rules and moves. Play starts when everyone chooses replay or exits, or after 5 seconds. Undecided players will spectate. Return to Lobby cancels replay for everyone.</p></div>`;
  root.querySelector('#results').dataset.key = key;
  root
    .querySelector('#replay-vote')
    ?.addEventListener('click', () =>
      send({ type: 'postgame', choice: 'replay', roundNumber: room.roundNumber }),
    );
  root.querySelector('#return-lobby').onclick = () =>
    send({ type: 'postgame', choice: 'lobby', roundNumber: room.roundNumber });
  root.querySelector('#results-leave').onclick = leave;
  if (room?.replayDeadline) {
    const ends = performance.now() + Math.max(0, room.replayDeadline - room.serverNow);
    const tick = () => {
      const el = root.querySelector('#replay-countdown');
      if (!root.isConnected || !el) {
        clearInterval(timer);
        return;
      }
      el.textContent = Math.max(0, Math.ceil((ends - performance.now()) / 1000));
    };
    tick();
    timer = setInterval(tick, 100);
  }
}
