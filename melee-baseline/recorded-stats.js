import { createReplayPlayer } from './human18/app/replay-player.js';
import { collectStats } from './duel-stats.js?v=30';

const engines = {
  'composed-b9004': '../melee-moderate/replay/shared/sim/composed/engine.js',
  'composed-b9005': './human16/shared/sim/composed/engine.js',
  'composed-b9006': './human17/shared/sim/composed/engine.js',
  'composed-b9008': './human19/shared/sim/composed/engine.js',
  'composed-b9007': './human18/shared/sim/composed/engine.js',
};
export async function verifiedRecording(game, options) {
  const path = engines[game.engineBuild];
  if (!path) throw Error('Unsupported recorded engine');
  const engine = await import(path);
  let collector;
  const player = createReplayPlayer(
    {
      ...engine,
      step(state, input) {
        engine.step(state, input);
        collector?.step(state);
      },
    },
    game,
    options,
  );
  collector = collectStats(player.state);
  player.seek(player.total);
  if (player.mismatch) throw Error('Replay checkpoints did not match');
  const stats = collector.sides;
  collector = null;
  player.seek(0);
  return { player, stats };
}
