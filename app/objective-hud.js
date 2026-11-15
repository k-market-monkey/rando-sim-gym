import { TEAMS } from '../shared/sim/teams.js';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function objectiveMarkup(state, localId) {
  if (state.mode !== 'ctf') return '';
  const carried = state.flags?.find((flag) => flag.carrierId === localId && localId);
  return `<div class="ctf-objectives" aria-label="Capture the flag objectives">${(state.flags || [])
    .map((flag) => {
      const team = TEAMS.find((team) => team.id === flag.team),
        carrier = state.players.find((player) => player.id === flag.carrierId);
      return `<span class="ctf-team" data-flag-team="${flag.team}"><i style="background:${team?.color}"></i><strong>${escape(team?.label)} ${state.teamScores?.[flag.team] || 0}/3</strong> · ${flag.status === 'carried' ? `carried by ${escape(carrier?.name || 'a fighter')}` : flag.status === 'dropped' ? `dropped · ${Math.ceil(flag.returnTicks / 30)}s to return` : 'home'}</span>`;
    })
    .join(
      '',
    )}${carried ? `<strong class="ctf-carried">You carry the ${escape(TEAMS.find((team) => team.id === carried.team)?.label)} flag</strong>` : ''}</div>`;
}
export function meleeStatus(player) {
  return player.meleeAttack
    ? 'WINDUP'
    : player.meleeRecovery > 0
      ? 'RECOVERY'
      : player.meleeCooldown > 0
        ? (player.meleeCooldown / 30).toFixed(1) + 'S'
        : 'READY';
}
