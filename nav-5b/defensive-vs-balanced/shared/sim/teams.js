import { selfDamageEnabled } from './composed/self-damage.js';
import { isComponentFormat } from '../protocol/versions.js';
import { square } from './exact-math.js';
import { arenaCenter, stateArena } from '../content/arena.js';
// Shared by both engines, the server and the character editor.
export const TEAMS = Object.freeze([
  Object.freeze({ id: 'red', label: 'Red', color: '#ef5555' }),
  Object.freeze({ id: 'yellow', label: 'Yellow', color: '#efd74f' }),
  Object.freeze({ id: 'green', label: 'Green', color: '#52c879' }),
  Object.freeze({ id: 'blue', label: 'Blue', color: '#528de5' }),
]);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rgb = (color) =>
  typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : null;
const hex = (channels) =>
  '#' + channels.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
export function normalizeTeam(value, fallback = null) {
  return TEAMS.some((team) => team.id === value) ? value : fallback;
}
const playerTeam = (player) => normalizeTeam(player?.team ?? player?.teamId);
export function leastPopulatedTeam(players = [], teamIds = ['red', 'blue']) {
  const choices = [...new Set(teamIds.map((id) => normalizeTeam(id)).filter(Boolean))];
  if (!choices.length) return 'red';
  return choices.reduce(
    (best, id) =>
      players.filter((p) => playerTeam(p) === id).length <
      players.filter((p) => playerTeam(p) === best).length
        ? id
        : best,
    choices[0],
  );
}
// Blending only toward black or white keeps accent colors within their team's hue.
export function teamAccentColor(team, shade = 20) {
  const primary = TEAMS.find((t) => t.id === normalizeTeam(team, 'red')).color;
  const value = clamp(Number.isFinite(Number(shade)) ? Number(shade) : 20, -55, 35) / 100;
  return hex(
    rgb(primary).map((channel) =>
      value < 0 ? channel * (1 + value) : channel + (255 - channel) * value,
    ),
  );
}
export function teamAccentShade(color, team) {
  const channels = rgb(color);
  if (!channels) return 20;
  let closest = 20,
    error = Infinity;
  for (let shade = -55; shade <= 35; shade++) {
    const candidate = rgb(teamAccentColor(team, shade)),
      distance = channels.reduce((sum, c, i) => sum + square(c - candidate[i]), 0);
    if (distance < error) {
      error = distance;
      closest = shade;
    }
  }
  return closest;
}
export function normalizeTeamAccent(color, team) {
  return teamAccentColor(team, teamAccentShade(color, team));
}
export function resolveAppearance(profile = {}, team) {
  const selected = TEAMS.find((t) => t.id === normalizeTeam(team));
  return selected
    ? {
        ...profile,
        color: selected.color,
        secondaryColor: normalizeTeamAccent(
          profile.teamColors?.[team] ?? profile.secondaryColor,
          team,
        ),
      }
    : { ...profile };
}
// An attack has one fixed representative color, regardless of decorative highlights.
// Environmental damage has no move and never inherits friendly-fire attenuation.
// With friendly fire off (Composed rooms), a teammate's attack does nothing.
export function relationDamageScale(move, owner, target, state = {}) {
  if (!move || !owner || !target) return 1;
  const self = owner.id === target.id;
  // Most hits land on an opponent; decide that before parsing the colour.
  if (!self && !(state.teamBattle && playerTeam(owner) && playerTeam(owner) === playerTeam(target)))
    return 1;
  if (self && !(isComponentFormat(state.formatVersion) && selfDamageEnabled(move, state))) return 0;
  if (!self && state.friendlyFire === false) return 0;
  const channels = rgb(move.coreColor ?? move.presentation?.coreColor ?? move.color) || [0, 0, 0];
  return self ? Math.min(channels[0], channels[1]) / 255 : channels[0] / 255;
}
export function recordTeamKill(state, target, owner) {
  const killer = typeof owner === 'string' ? state.players.find((p) => p.id === owner) : owner;
  const enemy = killer && killer.id !== target.id && playerTeam(killer) !== playerTeam(target);
  if (enemy) killer.kills++;
  if (state.mode === 'hill') return;
  const responsible = enemy ? killer : killer || target,
    team = playerTeam(responsible),
    delta = enemy ? 1 : -1;
  responsible.score += delta;
  if (team) {
    state.teamScores ??= {};
    state.teamScores[team] = (state.teamScores[team] || 0) + delta;
  }
}
export function tickTeamHill(state) {
  if (!state.teamBattle || state.mode !== 'hill') return;
  const center = arenaCenter(stateArena(state)),
    occupants = state.players.filter(
      (p) => !p.dead && square(p.x - center.x) + square(p.y - center.y) <= 75 * 75,
    );
  const teams = new Set(occupants.map(playerTeam).filter(Boolean));
  if (teams.size !== 1) return;
  const team = teams.values().next().value;
  state.teamScores ??= {};
  state.teamScores[team] = (state.teamScores[team] || 0) + 1;
  for (const player of occupants) player.score++;
}
export function teamStandings(state) {
  return TEAMS.map((team) => {
    const players = state.players.filter((p) => playerTeam(p) === team.id);
    return {
      ...team,
      score: state.teamScores?.[team.id] || 0,
      kills: players.reduce((sum, p) => sum + p.kills, 0),
      lives: players.reduce((sum, p) => sum + Math.max(0, p.lives), 0),
      hp: players.reduce((sum, p) => sum + (p.dead ? 0 : p.hp), 0),
      alive: players.filter((p) => !p.dead || p.respawn > 0).length,
      playerIds: players.map((p) => p.id),
    };
  }).filter((team) => team.playerIds.length);
}
export function teamOutcome(state) {
  const standings = teamStandings(state),
    alive = standings.filter((team) => team.alive > 0);
  const eliminated = state.mode === 'lives' && alive.length <= 1,
    expired = state.tick >= state.timeLimit * 30;
  if (!state.teamBattle || (!eliminated && !expired))
    return { ended: false, winnerTeam: null, winners: [] };
  let winner = null;
  if (eliminated) winner = alive.length === 1 ? alive[0] : null;
  else {
    const compare =
      state.mode === 'lives'
        ? (a, b) => b.lives - a.lives || b.hp - a.hp
        : (a, b) => b.score - a.score;
    const ranked = standings.slice().sort(compare);
    if (ranked[0] && (!ranked[1] || compare(ranked[0], ranked[1]) !== 0)) winner = ranked[0];
  }
  return { ended: true, winnerTeam: winner?.id || null, winners: winner?.playerIds || [] };
}
