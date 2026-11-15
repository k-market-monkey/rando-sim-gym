// The combat stream: a readable log of the events that arrive with each state
// message. Building lines is pure; the panel below the arena only shows them.
import { playerSettings, updatePlayerSettings } from './player-settings.js';

export const MAX_LINES = 50;

/**
 * Collects lines for one round. `add(state)` reads `state.events` and returns
 * true when the lines changed. Only hits with exact move keys can merge.
 * Legacy and environmental hits stay separate because their move is unknown.
 */
export function createCombatLog({ mergeTicks, maxLines = MAX_LINES }) {
  let lines = [],
    nextId = 1;
  const name = (state, playerId) => state.players.find((p) => p.id === playerId)?.name || 'Someone';
  function push(line) {
    lines.unshift({ id: nextId++, ...line });
    if (lines.length > maxLines) lines.length = maxLines;
  }
  function add(state) {
    let changed = false;
    for (const event of state.events || []) {
      if (event.type === 'cast') {
        push({
          kind: 'cast',
          text: `${name(state, event.playerId)} used ${event.move?.name || 'a move'}`,
        });
      } else if (event.type === 'hit') {
        const key =
            event.owner && event.moveKey
              ? JSON.stringify([event.owner, event.playerId, event.moveKey])
              : null,
          open =
            key && lines.find((line) => line.key === key && state.tick - line.tick <= mergeTicks);
        const damage = (open?.damage || 0) + (Number(event.damage) || 0),
          source =
            event.owner && event.owner !== event.playerId
              ? ` from ${name(state, event.owner)}`
              : '',
          text = `${name(state, event.playerId)} took ${Math.round(damage)} damage${source}`;
        if (open) Object.assign(open, { damage, text, tick: state.tick });
        else push({ kind: 'hit', key, damage, text, tick: state.tick, color: event.color });
      } else if (event.type === 'kill') {
        const killer = event.owner && event.owner !== event.playerId ? event.owner : null;
        push({
          kind: 'kill',
          text: killer
            ? `${name(state, killer)} knocked out ${name(state, event.playerId)}`
            : `${name(state, event.playerId)} was knocked out`,
        });
      } else if (event.type === 'shieldbreak') {
        push({ kind: 'shieldbreak', text: `${name(state, event.playerId)}'s shield broke` });
      } else continue;
      changed = true;
    }
    return changed;
  }
  return {
    add,
    get lines() {
      return lines;
    },
  };
}

export function combatStreamMarkup(open = playerSettings().combatStreamOpen) {
  return `<details class="combat-stream" id="combat-stream" ${open ? 'open' : ''}><summary>COMBAT</summary><ol class="combat-lines"></ol></details>`;
}

/**
 * Keeps one log per round. `mount(panel)` attaches the panel that
 * `combatStreamMarkup` drew; `receive(state, roundKey)` adds a state's events
 * and starts a fresh log when `roundKey` changes.
 */
export function createCombatStream({ mergeTicks }) {
  let log = null,
    logKey = null,
    list = null;
  function draw() {
    list?.replaceChildren(
      ...(log?.lines || []).map((line) => {
        const item = document.createElement('li');
        item.className = 'combat-line ' + line.kind;
        if (line.color) item.style.setProperty('--line-color', line.color);
        item.textContent = line.text;
        return item;
      }),
    );
  }
  return {
    mount(panel) {
      list = panel?.querySelector('.combat-lines') || null;
      panel?.addEventListener('toggle', () =>
        updatePlayerSettings({ combatStreamOpen: panel.open }),
      );
      draw();
    },
    receive(state, roundKey) {
      const fresh = logKey !== roundKey;
      if (fresh) {
        log = createCombatLog({ mergeTicks });
        logKey = roundKey;
      }
      if (log.add(state) || fresh) draw();
    },
  };
}
