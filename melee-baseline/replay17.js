import { replayTime, REPLAY_SPEEDS } from './human17/app/replay-player.js';
import { renderArena, receiveEffects } from './human18/app/gym-renderer.js';
import { verifiedRecording } from './recorded-stats.js';
import { combatTable } from './stats-view.js';
const $ = (id) => document.getElementById(id);
const speedKey = 'rando-gym-replay-speed';
function initialSpeed(runSpeed) {
  let saved;
  try {
    saved = Number(localStorage.getItem(speedKey));
  } catch {}
  return REPLAY_SPEEDS.includes(saved) ? saved : REPLAY_SPEEDS.includes(runSpeed) ? runSpeed : 0.75;
}
let player,
  previousTime = 0;
window.addEventListener('message', async (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'gym-replay') return;
  try {
    player?.pause();
    const { game, tuning } = event.data;
    const verified = await verifiedRecording(game, { onStep: (s) => receiveEffects(s.events) });
    player = verified.player;
    const sides = event.data.moves ?? game.header.players.map((p) => p.loadout[0].name);
    $('game-stats').replaceChildren(combatTable([{ game, stats: verified.stats }], sides, false));
    $('seek').max = player.total;
    $('speed').value = String(initialSpeed(tuning?.speed));
    player.setSpeed(Number($('speed').value));
    $('hitboxes').checked = !!tuning?.hitboxes;
    $('verification').textContent = 'Replay verified against every checkpoint and final state.';
    previousTime = performance.now();
    player.play();
  } catch (error) {
    $('verification').textContent = error.message;
  }
});
$('play').onclick = () => {
  if (!player) return;
  if (player.playing) player.pause();
  else {
    if (player.tick === player.total) player.seek(0);
    player.play();
  }
};
$('seek').oninput = () => player?.seek(Number($('seek').value));
$('speed').onchange = () => {
  const speed = $('speed').value;
  player?.setSpeed(Number(speed));
  try {
    localStorage.setItem(speedKey, speed);
  } catch {}
};
function draw(time) {
  const elapsed = Math.min(250, time - (previousTime || time));
  previousTime = time;
  if (player) {
    player.advance(elapsed);
    renderArena($('arena'), player.state, {
      showHitboxes: $('hitboxes').checked,
      flinchPlayers: new Map(player.state.players.map((p) => [p.id, p.flinchTicks || 0])),
      flinchDuration: player.state.flinchFrames || 6,
    });
    $('seek').value = player.tick;
    $('play').textContent = player.playing
      ? 'Pause'
      : player.tick === player.total
        ? 'Play again'
        : 'Play';
    $('position').textContent =
      `${replayTime(player.tick / 30)} / ${replayTime(player.total / 30)}`;
    $('fighters').textContent = player.state.players
      .map((p) => `${p.name}: ${p.dead ? 'Out' : Math.round(p.hp) + ' HP'}`)
      .join(' · ');
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
