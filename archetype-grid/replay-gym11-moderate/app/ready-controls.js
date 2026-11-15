import { startStatus } from './ready-status.js';

export function createReadyControls({
  store,
  connection,
  libraryClient,
  loadoutManager,
  loadout,
  member,
  selectedPlayers,
  refreshRecommendedLoadouts,
  esc,
}) {
  const $ = (selector) => document.querySelector(selector);
  const send = ({ type, ...fields }) => connection.send(type, fields);
  const currentReadyStatus = loadout.currentReadyStatus,
    syncLoadout = loadout.sync,
    lockMove = loadout.lockMove,
    randomizeLoadout = loadout.randomize;
  function currentStartStatus() {
    return startStatus({
      connected: connection.ready,
      players: selectedPlayers(),
      moveCount: store.room?.settings.moves,
      teamBattle: store.room?.settings.teamBattle,
      canAddBot:
        store.room?.players.length < 12 &&
        store.room.players.filter((player) => player.bot).length < 4,
    });
  }

  function readyHelpMarkup(status) {
    return `<p id="ready-blocker-status" class="helper" role="status">${esc(member()?.ready && status.reason !== 'ready' ? 'Marked ready. Before the next round: ' : '')}${esc(status.message)}</p><div class="ready-help-actions">${status.actions.map((action) => `<button type="button" class="button small subtle" data-ready-action="${esc(action.type)}" ${action.slot === undefined ? '' : `data-ready-slot="${action.slot}"`}${action.builtin ? ` data-ready-builtin="${esc(action.builtin)}"` : ''}>${esc(action.label)}</button>`).join('')}</div>`;
  }

  function startHelpMarkup(status) {
    return `<p id="start-blocker-status" class="helper" role="status">${esc(status.message)}</p>${status.action ? `<button type="button" class="button small subtle" data-ready-action="${esc(status.action.type)}">${esc(status.action.label)}</button>` : ''}`;
  }

  function refreshReadyControl() {
    loadoutManager.refresh();
    refreshRecommendedLoadouts();
    const button = $('#ready');
    if (!button) return;
    const status = currentReadyStatus();
    button.disabled = !status.canToggle;
    button.setAttribute('aria-describedby', 'ready-blocker-status');
    const help = $('#ready-help');
    if (help) {
      help.dataset.readyReason = status.reason;
      help.dataset.progressPhase = status.progressPhase || '';
      help.setAttribute('aria-busy', String(status.busy));
      const markup = readyHelpMarkup(status);
      if (help.readyMarkup !== markup) {
        help.innerHTML = markup;
        help.readyMarkup = markup;
      }
    }
    const start = $('#start'),
      startHelp = $('#start-help');
    if (start && startHelp) {
      const status = currentStartStatus();
      start.disabled = !status.canStart;
      startHelp.dataset.startReason = status.reason;
      const markup = startHelpMarkup(status);
      if (startHelp.readyMarkup !== markup) {
        startHelp.innerHTML = markup;
        startHelp.readyMarkup = markup;
      }
    }
  }

  function bindReadyControls() {
    $('#start')?.addEventListener('click', () => {
      if (currentStartStatus().canStart) send({ type: 'start' });
      else refreshReadyControl();
    });
    $('#panel-rematch')?.addEventListener('click', () =>
      send({ type: 'postgame', choice: 'lobby', roundNumber: store.room.roundNumber }),
    );
    $('#ready')?.addEventListener('click', () => {
      const status = currentReadyStatus();
      if (!status.canToggle) {
        refreshReadyControl();
        return;
      }
      send({ type: 'ready' });
    });
    for (const help of [$('#ready-help'), $('#start-help')].filter(Boolean)) {
      // Keep a click on a recovery action from blurring and generating an unfinished
      // custom name before the action can replace it with a library move.
      help.onmousedown = (event) => {
        if (event.target.closest('[data-ready-action]')) event.preventDefault();
      };
      help.onclick = (event) => {
        const button = event.target.closest('[data-ready-action]');
        if (!button) return;
        const action = button.dataset.readyAction,
          slot = Number(button.dataset.readySlot);
        if (action === 'reconnect') {
          connection.reconnect();
          return;
        }
        if (action === 'library') {
          libraryClient.load();
          return;
        }
        if (action === 'join') {
          send({ type: 'participation', queued: true });
          return;
        }
        if (action === 'add-bot') {
          send({ type: 'addBot' });
          return;
        }
        if (action === 'players' || action === 'team') {
          const target = action === 'team' ? $('#player-team') : $('.players-list');
          target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          target?.focus();
          return;
        }
        if (action === 'randomize') {
          randomizeLoadout();
          return;
        }
        if (action === 'sync') {
          syncLoadout();
          refreshReadyControl();
          return;
        }
        if (action === 'hotkey') {
          const key = $('#hotkey-' + button.dataset.readyBuiltin);
          key?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          key?.click();
          return;
        }
        if (action === 'lock') {
          lockMove(slot, true);
          return;
        }
        if (action === 'focus') {
          const input = $('#loadout-' + slot);
          input?.focus();
          input?.select();
          input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      };
    }
  }

  function readyMarkup() {
    const me = member(),
      host = store.room.hostId === connection.id,
      status = currentReadyStatus(),
      start = currentStartStatus();
    return `<div class="next-seat-status">${me?.queued === false ? 'You are spectating only.' : (store.room.nextPlayerIds || []).includes(connection.id) ? 'You have a seat in the next round.' : 'You are queued and waiting for a seat.'}</div><div class="lobby-actions"><button id="ready" class="button ${me?.ready ? 'subtle' : 'primary'}" aria-describedby="ready-blocker-status" ${status.canToggle ? '' : 'disabled'}>${me?.ready ? '✓ READY · UNREADY' : store.room.phase === 'lobby' ? 'I’M READY →' : 'READY FOR NEXT →'}</button>${host && store.room.phase === 'lobby' ? `<button id="start" class="button primary" aria-describedby="start-blocker-status" ${start.canStart ? '' : 'disabled'}>${store.room.settings.bans ? 'PICK & BAN' : 'START MATCH'} ↗</button>` : ''}${['lobby', 'banning', 'starting'].includes(store.room.phase) ? `<label class="access-checkbox auto-start-control"><input id="auto-start" type="checkbox" data-setting="autoStart" ${store.room.settings.autoStart ? 'checked' : ''} ${host ? '' : 'disabled'} aria-describedby="auto-start-help"> Autostart</label>` : ''}${store.room.phase === 'finished' ? '<button id="panel-rematch" class="button primary">RETURN TO LOBBY</button>' : ''}</div>${['lobby', 'banning', 'starting'].includes(store.room.phase) ? '<p id="auto-start-help" class="helper">Starts five seconds after everyone is ready. If bans are enabled, they happen first.</p>' : ''}<div id="ready-help" class="ready-help" data-ready-reason="${status.reason}" aria-busy="${status.busy}">${readyHelpMarkup(status)}</div>${host && store.room.phase === 'lobby' ? `<div id="start-help" class="ready-help start-help" data-start-reason="${start.reason}">${startHelpMarkup(start)}</div>` : ''}`;
  }
  return {
    markup: readyMarkup,
    bind: bindReadyControls,
    refresh: refreshReadyControl,
    currentStartStatus,
  };
}
