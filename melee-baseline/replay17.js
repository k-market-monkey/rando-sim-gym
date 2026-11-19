import { createReplayPlayer, replayTime } from './human17/app/replay-player.js';
import { renderArena, receiveEffects } from './human17/app/gym-renderer.js';
const $ = (id) => document.getElementById(id);
let player,
  previousTime = 0;
window.addEventListener('message', async (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'gym-replay') return;
  try {
    player?.pause();
    const { game, tuning } = event.data;
    const path =
      game.engineBuild === 'composed-b9004'
        ? '../melee-moderate/replay/shared/sim/composed/engine.js'
        : game.engineBuild === 'composed-b9005'
          ? './human16/shared/sim/composed/engine.js'
          : game.engineBuild === 'composed-b9006'
            ? './human17/shared/sim/composed/engine.js'
            : null;
    if (!path) throw Error('Unsupported recorded engine');
    const engine = await import(path);
    player = createReplayPlayer(engine, game, {
      onStep: (s) => receiveEffects(s.events),
      onMismatch: () => {
        $('verification').textContent = 'Replay verification failed';
      },
    });
    player.seek(player.total);
    if (player.mismatch) throw Error('Replay checkpoints did not match');
    player.seek(0);
    $('seek').max = player.total;
    $('speed').value = String(tuning?.speed || 0.75);
    player.setSpeed(Number($('speed').value));
    $('hitboxes').checked = !!tuning?.hitboxes;
    $('verification').textContent = 'Replay verified against every checkpoint and final state.';
    draw();
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
$('speed').onchange = () => player?.setSpeed(Number($('speed').value));
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
