import { TEAMS } from '../shared/sim/teams.js';
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let timer;
export function stopRoundCountdown() {
  clearInterval(timer);
  timer = null;
}
export function renderRoundCountdown({
  root,
  room,
  id,
  headerHTML,
  bindHeader,
  drawAvatar,
  summary,
}) {
  stopRoundCountdown();
  const fighters = room.roundPlayers || [],
    spectating = !fighters.some((player) => player.id === id);
  const reconnecting = fighters.filter((player) =>
    room.players?.some((member) => member.id === player.id && member.reconnecting),
  );
  root.innerHTML =
    headerHTML +
    `<section class="round-preview" aria-labelledby="round-preview-title"><div class="round-preview-heading"><div><span class="eyebrow">${spectating ? 'SPECTATING' : 'NEXT ROUND'}</span><h2 id="round-preview-title">${reconnecting.length ? 'Waiting for players to reconnect' : 'Round starts in'}</h2><p>${esc(summary)}</p>${reconnecting.length ? `<p role="status">Reconnecting: ${reconnecting.map((player) => esc(player.name)).join(', ')}. Their seats are held for up to 60 seconds.</p>` : ''}</div><strong id="round-countdown" role="timer" aria-label="Seconds until round starts">5</strong></div><div class="round-preview-roster">${fighters
      .map((player) => {
        const team = room.roundSettings?.teamBattle
          ? TEAMS.find((team) => team.id === player.team)
          : null;
        const moves = player.loadout.filter((name) => !player.bans.includes(name));
        return `<article class="round-preview-player" data-preview-player="${esc(player.id)}"><div class="round-preview-identity"><canvas data-preview-avatar="${esc(player.id)}" aria-hidden="true"></canvas><div><h3>${esc(player.name)}${player.id === id ? ' <span class="label">YOU</span>' : ''}</h3><span class="label">${team ? esc(team.label.toUpperCase()) + ' TEAM' : player.bot ? 'BOT' : 'FIGHTER'}</span></div></div><ol class="round-preview-moves">${moves.map((name) => `<li>${esc(name)}</li>`).join('')}</ol></article>`;
      })
      .join(
        '',
      )}</div><p class="helper">${spectating ? 'You’re watching this round.' : 'Your moves for this round are locked in.'}</p></section>`;
  bindHeader();
  for (const canvas of root.querySelectorAll('[data-preview-avatar]')) {
    const player = fighters.find((player) => player.id === canvas.dataset.previewAvatar);
    if (player) drawAvatar(canvas, player);
  }
  const deadline = performance.now() + Math.max(0, room.startDeadline - room.serverNow);
  const tick = () => {
    const element = root.querySelector('#round-countdown');
    if (!element || !root.isConnected) {
      stopRoundCountdown();
      return;
    }
    const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    element.textContent = reconnecting.length ? '…' : seconds || 'GO';
  };
  tick();
  timer = setInterval(tick, 100);
}
