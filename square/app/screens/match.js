import { MAP_CATALOG } from '/rando-sim-gym/square/shared/content/maps/catalog.js';
import { WIDTH, HEIGHT } from '/rando-sim-gym/square/shared/content/arena.js';
import { TICK_RATE } from '/rando-sim-gym/square/shared/sim/classic/engine.js';
import { teamStandings } from '/rando-sim-gym/square/shared/sim/teams.js';
import { getEngineView } from '../engine-view.js';
import { withEnemyColors } from '../player-settings.js';
import { combatStreamMarkup, createCombatStream } from '../combat-stream.js';
import { objectiveMarkup, swipeStatus, shootStatus } from '../objective-hud.js';
import { dashStatus } from '../dash-status.js';
import { serverOrigin } from '../servers.js';
import { renderArena, receiveEffects } from '../renderer.js';
import { hotkeyLabel } from '../preferences.js';
import { renderPostgame } from '../postgame-ui.js';

let root = null,
  context = null,
  animationFrame = null,
  lastInputAt = 0;
const $ = (selector) => root?.querySelector(selector);
const combatStream = createCombatStream({ mergeTicks: TICK_RATE / 2 });

export function mount(element, nextContext) {
  unmount();
  root = element;
  context = nextContext;
  const { store, connection, servers, esc, modeNames, input, leave } = context;
  document.body.classList.add('in-match');
  // Rooms can turn dash or shield off; their HUD boxes and hints go with them.
  const rules = store.state || store.room?.roundSettings || {},
    composed = rules.mechanicsVersion === 'composed',
    dashOff = composed && rules.dashEnabled === false,
    shieldOff = composed && rules.shieldEnabled === false,
    keyText = (action) => esc(hotkeyLabel(input.builtinKey?.(action) || '')),
    dashKey = keyText('dash'),
    shieldKey = keyText('shield');
  root.innerHTML = `<section class="match-shell"><div class="match-top"><div class="match-title">${esc(MAP_CATALOG.find((st) => st.id === (store.state?.stage || store.room?.roundSettings?.stage))?.name || 'ARENA').toUpperCase()} <small>${esc(modeNames[store.state?.mode || store.room?.roundSettings?.mode] || '')}</small></div><div class="clock" id="match-clock">--:--</div><div class="match-info"><div>${store.room?.practice ? 'SOLO BOT MATCH' : 'ROOM ' + esc(store.room?.code || '')}</div><div style="margin-top:5px"><span id="ping">${connection.latency} MS</span> · ${esc(servers.selected?.label || store.room?.region || 'New York')} &nbsp; <button class="back-link" id="match-leave">LEAVE ↗</button></div></div></div><div class="arena-wrap"><canvas id="game-canvas" class="game-canvas" width="${WIDTH}" height="${HEIGHT}" tabindex="0" aria-label="Game arena. WASD to move, mouse to aim, use your hotkeys or numbers 1–5 to cast, ${dashKey} to dash, ${shieldKey} to shield."></canvas><div class="scoreboard" id="scoreboard"></div><div id="arena-overlay"></div></div><div id="objective-hud" aria-live="polite"></div><div id="spectator-hud" class="spectator-hud" hidden></div><div class="match-hud"><div class="vitals"><div class="vital-label"><span>HEALTH</span><span id="hp-number">100</span></div><div class="bar"><div id="hp-bar" style="width:100%"></div></div><div class="vital-label"${shieldOff ? ' hidden' : ''}><span id="shield-label">SHIELD</span><span id="shield-number">100</span></div><div class="bar shield"${shieldOff ? ' hidden' : ''}><div id="shield-bar" style="width:100%"></div></div></div><div class="ability-list" id="abilities"></div><div class="dash-box"${dashOff && shieldOff ? ' hidden' : ''}>${dashOff ? '' : `<div><span>${dashKey}</span><small id="dash-status">READY</small></div>`}${shieldOff ? '' : `<div><span>${shieldKey}</span><small>SHIELD</small></div><small>RELEASE TO RECHARGE</small>`}</div></div>${combatStreamMarkup()}<div class="controls-strip"><span><b>W A S D</b> MOVE</span><span><b>MOUSE</b> AIM</span><span><b>YOUR HOTKEYS</b> CAST</span><span><b>1–5</b> CAST SLOT</span>${dashOff ? '' : `<span><b>${dashKey}</b> DASH</span>`}${shieldOff ? '' : `<span><b>${shieldKey}</b> SHIELD</span>`}${composed ? '<span><b>6–0</b> EMOTE</span>' : ''}${store.room.pauseControllerId === connection.id ? '<span><b>ESC</b> PAUSE</span>' : ''}</div></section>`;
  $('#match-leave').onclick = leave;
  combatStream.mount($('#combat-stream'));
  const canvas = $('#game-canvas');
  input.bindCanvas(canvas);
  if (!context.dockOpen) canvas.focus();
  updateHUD();
  context.renderDock();
  animationFrame = requestAnimationFrame(frame);
}
export function updateHUD() {
  if (!context) return;
  const {
    store,
    connection,
    servers,
    input,
    esc,
    member,
    send,
    leave,
    openRoomPanel,
    positionRoomDock,
  } = context;
  const abilityKey = input.abilityKey;
  if (!store.state || !$('#game-canvas')) return;
  const me = store.state.players.find((p) => p.id === connection.id),
    engineView = getEngineView(store.round?.engine),
    seconds = Math.max(0, Math.ceil(store.state.timeLimit - store.state.tick / TICK_RATE));
  $('#match-clock').textContent =
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('#scoreboard').innerHTML = (
    store.state.teamBattle
      ? teamStandings(store.state).map((t) => ({
          ...t,
          name: t.label + ' team',
          id: t.playerIds.includes(connection.id) ? connection.id : t.id,
        }))
      : store.state.players
  )
    .map(
      (p) =>
        `<div class="score-item"><i style="background:${esc(p.color)}"></i><span>${esc(p.name)}${p.id === connection.id ? ' •' : ''}</span><strong>${store.state.mode === 'lives' ? p.lives + ' ♥' : store.state.mode === 'hill' ? Math.floor(p.score / TICK_RATE) : p.score}</strong></div>`,
    )
    .join('');
  $('#objective-hud').innerHTML = objectiveMarkup(store.state, connection.id);
  const spectator = $('#spectator-hud');
  $('.match-hud').hidden = !me;
  $('.controls-strip').hidden = !me;
  spectator.hidden = !!me;
  if (!me) {
    const status =
      member()?.queued === false
        ? 'You are spectating only.'
        : (store.room?.nextPlayerIds || []).includes(connection.id)
          ? 'You have a seat in the next round.'
          : 'You are queued for a future round.';
    const spectatorKey = status + '|' + store.room?.roundNumber;
    if (spectator.dataset.status !== spectatorKey) {
      spectator.dataset.status = spectatorKey;
      spectator.innerHTML = `<div><span class="label">SPECTATING ROUND ${store.room?.roundNumber || 1}</span><strong>${status}</strong></div><button id="prepare-next" class="button small primary">PREPARE NEXT ROUND ↗</button>`;
      $('#prepare-next').onclick = () => openRoomPanel('next');
    }
  }
  if (me) {
    $('#hp-number').textContent = Math.ceil(me.hp) + ' / ' + (me.maxHp || 100);
    $('#hp-bar').style.width = Math.max(0, Math.min(100, (me.hp / (me.maxHp || 100)) * 100)) + '%';
    $('#shield-number').textContent = Math.ceil(me.shield);
    $('#shield-label').textContent = me.shieldLocked
      ? 'SHIELD · BROKEN'
      : !me.shielding && me.shieldRelease > 0
        ? 'SHIELD · LOWERING'
        : !me.shielding && me.shieldCooldown > 0
          ? 'SHIELD · COOLDOWN'
          : me.shieldPerfect > 0
            ? 'SHIELD · PERFECT'
            : 'SHIELD';
    $('#shield-bar').style.width = me.shield + '%';
    // A broken shield refills in red until it can be raised again.
    $('#shield-bar').dataset.state = me.shieldLocked ? 'broken' : '';
    if ($('#dash-status'))
      $('#dash-status').textContent = dashStatus(me, store.state.entities, TICK_RATE);
    $('#abilities').innerHTML = me.loadout
      .map((m, i) =>
        engineView.abilityStatus(
          m,
          me,
          i,
          abilityKey(m) ? hotkeyLabel(abilityKey(m)) + ' / ' : '',
          store.state.teamBattle,
          store.state,
        ),
      )
      .join('');
    if (store.state.shootEnabled === true)
      $('#abilities').innerHTML += builtinAbility('shoot', shootStatus(me), {
        fill: Math.min(100, Math.round(me.shootHeat || 0)),
        hot: me.shootOverheated,
      });
    if (store.state.swipeEnabled === true)
      $('#abilities').innerHTML += builtinAbility('swipe', swipeStatus(me));
  }
  const overlay = $('#arena-overlay');
  if (store.state.ended) {
    renderPostgame({
      root: overlay,
      state: store.state,
      room: store.room,
      id: connection.id,
      send,
      leave,
      replayOrigin: serverOrigin(servers.selected),
    });
  } else if (store.room.paused) {
    renderPauseOverlay(overlay);
  } else if (me?.dead) {
    overlay.innerHTML = `<div class="arena-message"><h2>${me.respawn ? 'BACK IN ' + Math.ceil(me.respawn / TICK_RATE) : 'KNOCKED OUT.'}</h2><p>${me.respawn ? 'Respawning shortly.' : 'Spectating until the round ends.'}</p></div>`;
  } else if (overlay.innerHTML) overlay.innerHTML = '';
  positionRoomDock();
}
/** A built-in action's HUD card, laid out like a move's. */
function builtinAbility(action, status, { fill = 0, hot = false } = {}) {
  const { input, esc } = context,
    key = input.builtinKey?.(action) || '';
  return `<div class="ability builtin-ability${hot ? ' cooling overheated' : ''}" id="${action}-ability"><div class="cooldown-fill" style="height:${fill}%"></div><kbd>${esc(key ? hotkeyLabel(key) : 'NO KEY')}</kbd><div class="ability-name">${action.toUpperCase()}</div><div class="ability-status" id="${action}-status">${esc(status)}</div></div>`;
}
function renderPauseOverlay(root) {
  const { store, connection, input, send } = context;
  const mine = store.room.pauseControllerId === connection.id,
    leavable = mine && store.room.practice,
    key = 'pause:' + store.room.pausedBy + ':' + mine + ':' + leavable;
  if (root.dataset.pauseKey === key && root.querySelector('#pause-screen')) return;
  root.dataset.pauseKey = key;
  root.innerHTML = `<div id="pause-screen" class="pause-screen" role="dialog" aria-labelledby="pause-heading"><h2 id="pause-heading">PAUSED</h2><p>${mine ? 'Press Escape to resume.' : 'Waiting for the fighter to resume.'}</p>${mine ? '<button type="button" class="button primary" id="resume-game">RESUME →</button>' : ''}${leavable ? '<button type="button" class="button subtle" id="end-round">RETURN TO LOBBY</button>' : ''}</div>`;
  $('#resume-game')?.addEventListener('click', () => {
    input.togglePause();
    $('#game-canvas')?.focus();
  });
  $('#end-round')?.addEventListener('click', () =>
    send({ type: 'endRound', roundNumber: store.room.roundNumber }),
  );
}
function frame(now) {
  const { store, connection, input, send } = context;
  if (store.view === 'match' && store.state) {
    let display = store.state;
    if (store.previousState && !store.state.ended && !store.room?.paused) {
      const f = Math.min(1, (now - store.stateAt) / 67);
      display = {
        ...store.state,
        players: store.state.players.map((p) => {
          const old = store.previousState.players.find((o) => o.id === p.id);
          return old && old.dead === p.dead && Math.hypot(p.x - old.x, p.y - old.y) < 180
            ? { ...p, x: old.x + (p.x - old.x) * f, y: old.y + (p.y - old.y) * f }
            : p;
        }),
      };
    }
    renderArena($('#game-canvas'), withEnemyColors(display, connection.id), {
      localId: connection.id,
      aim: input.aim,
      playerAttackColors: store.room?.roundSettings?.playerAttackColors === true,
    });
    if (
      connection.ready &&
      !store.state.ended &&
      !store.room?.paused &&
      store.state.players.some((p) => p.id === connection.id) &&
      now - lastInputAt > 1000 / 30
    ) {
      lastInputAt = now;
      if (connection.open)
        send({
          type: 'input',
          roundNumber: store.room.roundNumber,
          inputRevision: store.room.inputRevision || 0,
          input: input.currentInput(),
        });
    }
  }
  animationFrame = requestAnimationFrame(frame);
}

export function unmount() {
  if (!root) return;
  cancelAnimationFrame(animationFrame);
  context.input.bindCanvas(null);
  combatStream.mount(null);
  document.body.classList.remove('in-match');
  root = null;
  context = null;
  animationFrame = null;
}

// Packet effects stay synchronous, including ticks received before mounting.
export function receive(state, roundKey) {
  receiveEffects(state.events);
  combatStream.receive(state, roundKey);
}
