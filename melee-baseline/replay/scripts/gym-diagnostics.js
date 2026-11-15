// Experiment-side movement diagnostics for gym duels. Reads states and inputs after
// each step; never feeds anything back into the simulation. Not a balance score.
import { allWalls } from '../shared/sim/composed/queries.js';
import { blockedSegment } from '../shared/sim/composed/geometry.js';
import { stateArena } from '../shared/content/arena.js';

/** Ticks of history a stall needs; at 4.5 units per tick a free walk covers 67 units. */
export const STALL_WINDOW = 15;
/** Staying within this distance of the window's start while steering counts as stalled. */
export const STALL_TRAVEL = 15;
/** Distance from the playable boundary that counts as near an edge. */
export const EDGE_MARGIN = 45;

const steering = (input) => Math.abs(input?.x || 0) + Math.abs(input?.y || 0) >= 0.5;
const attacking = (input, p) =>
  Boolean(
    input?.pressedSlots?.length ||
    input?.heldSlots?.length ||
    input?.shoot ||
    input?.swipe ||
    p.attack ||
    p.channel != null ||
    p.pendingAttack ||
    p.swipeAttack,
  );
// Gameplay-imposed motion: dash, shield walk, a lunge or knockback.
const restricted = (p) =>
  p.dashTicks > 0 ||
  p.shielding ||
  (p.attack && p.attack.lungeX != null) ||
  Math.abs(p.vx) + Math.abs(p.vy) > 1;

export function createGymDiagnostics(state) {
  const { width, height } = stateArena(state),
    rows = Object.fromEntries(
      state.players.map((p) => [
        p.id,
        {
          stalledTicks: 0,
          noSightTicks: 0,
          idleTicks: 0,
          longestIdleTicks: 0,
          edgeTicks: 0,
          cornerTicks: 0,
          damageDealt: 0,
          damageTaken: 0,
          history: [],
          idleRun: 0,
        },
      ]),
    );
  return {
    /** Call after `step(state, inputs)` with the inputs that step consumed. */
    observe(current, inputs) {
      const walls = allWalls(current);
      for (const event of current.events)
        if (event.type === 'hit' && rows[event.playerId]) {
          rows[event.playerId].damageTaken += event.damage;
          if (event.owner && event.owner !== event.playerId && rows[event.owner])
            rows[event.owner].damageDealt += event.damage;
        }
      for (const p of current.players) {
        const row = rows[p.id],
          input = inputs[p.id],
          foe = current.players.find((o) => o.id !== p.id && !o.dead);
        if (p.dead) {
          row.history = [];
          row.idleRun = 0;
          continue;
        }
        row.history.push({ x: p.x, y: p.y, steer: steering(input) && !restricted(p) });
        if (row.history.length > STALL_WINDOW) row.history.shift();
        const first = row.history[0];
        if (
          row.history.length === STALL_WINDOW &&
          row.history.every((h) => h.steer) &&
          row.history.every(
            (h) =>
              (h.x - first.x) * (h.x - first.x) + (h.y - first.y) * (h.y - first.y) <
              STALL_TRAVEL * STALL_TRAVEL,
          )
        )
          row.stalledTicks++;
        if (foe && blockedSegment(p.x, p.y, foe.x, foe.y, walls)) row.noSightTicks++;
        const previous = row.history[row.history.length - 2],
          still = previous && Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y) < 0.5;
        if (foe && still && !attacking(input, p)) {
          row.idleTicks++;
          row.longestIdleTicks = Math.max(row.longestIdleTicks, ++row.idleRun);
        } else row.idleRun = 0;
        const near = [p.x - 33, width - 33 - p.x, p.y - 33, height - 33 - p.y].filter(
          (gap) => gap < EDGE_MARGIN,
        ).length;
        if (near) row.edgeTicks++;
        if (near >= 2) row.cornerTicks++;
      }
    },
    result() {
      return Object.fromEntries(
        Object.entries(rows).map(([id, { history, idleRun, ...row }]) => [
          id,
          {
            ...row,
            damageDealt: Math.round(row.damageDealt * 10) / 10,
            damageTaken: Math.round(row.damageTaken * 10) / 10,
          },
        ]),
      );
    },
  };
}

/** Per-fighter totals across games, plus the definitions this report used. */
export function summarizeDiagnostics(games) {
  const keys = [
      'stalledTicks',
      'noSightTicks',
      'idleTicks',
      'edgeTicks',
      'cornerTicks',
      'damageDealt',
      'damageTaken',
    ],
    totals = { a: {}, b: {} };
  for (const seat of ['a', 'b']) {
    for (const key of keys)
      totals[seat][key] =
        Math.round(games.reduce((sum, game) => sum + game.diagnostics[seat][key], 0) * 10) / 10;
    totals[seat].longestIdleTicks = Math.max(
      ...games.map((game) => game.diagnostics[seat].longestIdleTicks),
    );
    totals[seat].deaths = games.reduce(
      (sum, game) => sum + game.fighters.find((f) => f.id === seat).deaths,
      0,
    );
  }
  return totals;
}

export const DIAGNOSTIC_DEFINITIONS = Object.freeze({
  stalledTicks: `Alive, steering (|x|+|y| >= 0.5) without dash, shield, lunge or knockback on each of the last ${STALL_WINDOW} ticks, yet never more than ${STALL_TRAVEL} units from where the window began. Counts wall pushing and tight jitter; a wide back-and-forth around an obstacle is missed.`,
  noSightTicks:
    'Both alive and the centre-to-centre segment crosses a wall. Counted for every move, including lobs and aim-point placements that can act without a direct line.',
  idleTicks:
    'Alive with a live opponent, moved under 0.5 units this tick and neither attacking nor in an attack, channel or swipe. Includes steering into a wall and deliberate waiting.',
  longestIdleTicks: 'Longest consecutive run of idle ticks.',
  edgeTicks: `Alive within ${EDGE_MARGIN} units of the playable arena boundary; diagnostic, not a penalty.`,
  cornerTicks: `Alive within ${EDGE_MARGIN} units of two boundaries.`,
  damageDealt: 'Health damage from hit events this fighter owned against the opponent.',
  damageTaken: 'Health damage from all hit events on this fighter, including self-damage.',
});
