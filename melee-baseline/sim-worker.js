import * as engine from './human19/shared/sim/composed/engine.js';
import { encodeReplayInputs } from './human18/shared/protocol/replay-inputs.js';
import { createReplayPlayer } from './human18/app/replay-player.js';
import { sanitize, tunedMoves } from './tuning.js?v=28';
import { gamesPerPair } from './run-size.js';
import { collectStats } from './duel-stats.js?v=30';
import { orderedPair } from './matchups.js';
self.onmessage = async ({ data }) => {
  try {
    const tuning = sanitize(data.moves, data.tuning),
      moves = tunedMoves(data.moves, tuning),
      count = gamesPerPair(data.games),
      pairs = [];
    let done = 0;
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 3; b++) {
        const games = [];
        for (let i = 0; i < count; i++) {
          const reverse = i % 2 === 1,
            chosen = reverse ? [moves[b], moves[a]] : [moves[a], moves[b]],
            first = reverse ? 'b' : 'a';
          const header = {
            mode: 'simulation',
            seed: ((data.seed >>> 0) + (a * 3 + b) * 1009 + i * 7919) >>> 0,
            botDifficulty: tuning.difficulty,
            flinchFrames: tuning.flinch,
            parryFrames: tuning.parry,
            knockbackMultiplier: tuning.knockback,
            hitRadius: tuning.hitRadius,
            shieldReleaseFrames: tuning.shieldRelease,
            shieldRearmFrames: tuning.shieldRearm,
            swipeCooldownFrames: tuning.swipeCooldown,
            players: chosen.map((move, j) => ({
              id: j ? 'b' : 'a',
              name: move.name,
              color: j ? '#f574a5' : '#78f0c5',
              loadout: [move],
              look: tuning.shape,
            })),
          };
          const state = engine.createMatch(header),
            tracker = collectStats(state),
            inputs = [],
            checkpoints = [];
          while (!state.ended) {
            const input = Object.fromEntries(
              state.players.map((p) => {
                const intent = engine.botInput(state, p.id, {
                  movementStyle: tuning.style === 'stationary' ? 'balanced' : tuning.style,
                });
                return [
                  p.id,
                  tuning.style === 'stationary' ? { ...intent, x: 0, y: 0, dash: false } : intent,
                ];
              }),
            );
            inputs.push(structuredClone(input));
            engine.step(state, input);
            tracker.step(state);
            if (state.tick % 30 === 0) checkpoints.push([state.tick, engine.stateHash(state)]);
            if (state.tick > 810) throw Error('A duel exceeded its time limit');
          }
          const game = {
            format: 1,
            engineBuild: state.engineBuild,
            header,
            inputs: encodeReplayInputs(inputs, ['a', 'b']),
            checkpoints,
            final: { tick: state.tick, hash: engine.stateHash(state) },
          };
          const replay = createReplayPlayer(engine, game);
          replay.seek(replay.total);
          if (replay.mismatch) throw Error('Replay verification failed');
          const score = state.duelScore * (first === 'a' ? 1 : -1);
          games.push({
            id: i + 1,
            score,
            stats: tracker.sides,
            winner: state.winner === null ? 'draw' : state.winner === first ? 'a' : 'b',
            ticks: state.tick,
            reason: state.duelEndReason,
            game,
          });
          self.postMessage({ type: 'progress', done: ++done, total: count * 3 });
        }
        pairs.push({
          id: pairs.length + 1,
          moves: [moves[a].name, moves[b].name],
          mean: games.reduce((sum, g) => sum + g.score, 0) / count,
          wins: games.filter((g) => g.winner === 'a').length,
          losses: games.filter((g) => g.winner === 'b').length,
          draws: games.filter((g) => g.winner === 'draw').length,
          games,
        });
      }
    self.postMessage({
      type: 'complete',
      report: {
        format: 1,
        engineBuild: pairs[0].games[0].game.engineBuild,
        tuning,
        seed: data.seed,
        gamesPerPair: count,
        pairs: pairs.map(orderedPair),
      },
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
