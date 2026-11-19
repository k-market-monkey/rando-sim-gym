import { MAP_CATALOG } from '../../shared/content/maps/catalog.js';
import { WIDTH, HEIGHT } from '../../shared/content/arena.js';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../../shared/protocol/message-constants.js';
import { serverOrigin } from '../servers.js';
import { fetchRoomDirectory, filterRoomDirectory, directoryStatus } from '../room-browser.js';
import { readRoomSession, roomLocation } from '../room-session.js';
import { DEFAULT_ROOM_SETTINGS } from '../room-settings.js';
import { renderArena, demoState } from '../renderer.js';
import { mountRecentMoves } from '../recent-moves.js';
import { discordLinkMarkup } from '../room-ui.js';

export function createHomeScreen() {
  let context;
  const $ = (selector) => document.querySelector(selector);
  let app,
    animationFrame = null;
  let roomServerFilter = 'all',
    directoryErrors = [],
    directoryJoinSequence = 0;
  let publicRooms = [],
    roomsLoading = false,
    pendingJoinCode = null,
    linkJoinAttempted = false,
    createPrivate = false;
  const passwordDialog = document.createElement('dialog');
  passwordDialog.className = 'password-dialog';
  document.body.append(passwordDialog);
  passwordDialog.addEventListener('cancel', () => {
    pendingJoinCode = null;
    passwordDialog.replaceChildren();
  });
  function replayLinkMarkup() {
    const { servers, esc } = context;
    return servers.supportsReplays(servers.selected?.id)
      ? `<a class="back-link" id="replays-link" href="${esc(serverOrigin(servers.selected))}/replays.html">Recent replays →</a>`
      : '';
  }
  function renderHome() {
    const { stopHotkeyCapture, servers } = context;
    stopHotkeyCapture();
    document.body.classList.remove('in-match');
    app.innerHTML = `<section class="start-screen"><div class="start-demo"><canvas id="demo-canvas" width="${WIDTH}" height="${HEIGHT}" aria-label="Rando arena animation"></canvas><span class="start-demo-label">RANDO · ARENA FIGHTING</span></div><div class="start-toolbar"><div><h1>Rooms</h1><p class="helper">Join to play or spectate. Up to four fighters per round.</p>${discordLinkMarkup()}<span id="replays-menu">${replayLinkMarkup()}</span></div><div class="start-actions"><div class="room-create-controls" role="group" aria-label="Create a room"><div class="server-toolbar creation-server">${serverSelectorMarkup()}</div><div class="room-create-row"><button class="button primary" id="create-room">CREATE ROOM ↗</button><label class="create-private-label"><input id="create-private" type="checkbox" aria-controls="create-password" ${createPrivate ? 'checked' : ''}> Private</label></div><input id="create-password" type="password" aria-label="Room password" minlength="${PASSWORD_MIN_LENGTH}" maxlength="${PASSWORD_MAX_LENGTH}" autocomplete="new-password" placeholder="Password · 8–64 characters" ${createPrivate ? '' : 'hidden'}></div><button class="button subtle" id="practice">TRY A BOT MATCH →</button></div></div><section id="room-browser" class="room-browser"></section></section>`;
    $('#server-select')?.addEventListener('change', (e) => changeServer(e.target.value));
    $('#create-room').onclick = async () => {
      const password = $('#create-password')?.value || '';
      if (await changeServer(servers.creationServerId, { remember: false })) {
        const input = $('#create-password');
        if (input) input.value = password;
        createRoom(false);
      }
    };
    $('#practice').onclick = async () => {
      if (await changeServer(servers.creationServerId, { remember: false })) createRoom(true);
    };
    $('#create-private').onchange = (e) => {
      createPrivate = e.target.checked;
      $('#create-password').hidden = !createPrivate;
    };
    renderRoomBrowser();
    mountRecentMoves($('.start-screen'));
  }
  function saveName() {
    const { profileClient } = context;
    const input = $('#player-name');
    if (input) profileClient.setName(input.value);
  }
  async function createRoom(bot) {
    const { servers, connection, profileClient, libraryClient, loadout, practice, send, toast } =
      context;
    const requestedServer = servers.selected?.id;
    saveName();
    const privacy = !bot && createPrivate,
      password = privacy ? $('#create-password')?.value : '';
    if (
      privacy &&
      (!password || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
    ) {
      toast('Choose a room password with 8–64 characters.');
      $('#create-password')?.focus();
      return;
    }
    await connection.connect().catch(() => {});
    if (!connection.id || requestedServer !== servers.selected?.id) return;
    const requestedPlayer = connection.id;
    const settings = bot
      ? { ...DEFAULT_ROOM_SETTINGS, timeLimit: 60, bans: 0 }
      : { ...profileClient.roomSettings };
    profileClient.rememberRules(!bot);
    loadout.selectEdition(settings.mechanicsVersion);
    await libraryClient.load();
    if (requestedServer !== servers.selected?.id || requestedPlayer !== connection.id) return;
    loadout.prepareCreate(bot);
    if (bot) practice.start();
    send({
      type: 'create',
      practice: bot,
      ...profileClient.profile,
      team: profileClient.preferences.preferredTeam,
      teamColors: profileClient.preferences.teamColors,
      handicapPercent: profileClient.preferences.handicapPercent,
      loadout: loadout.serverLoadout(settings.moves),
      private: privacy,
      ...(privacy ? { password } : {}),
      settings,
    });
  }
  async function refreshRooms() {
    const { servers } = context;
    if (roomsLoading || !servers.registry.length) return;
    roomsLoading = true;
    renderRoomBrowser();
    try {
      const result = await fetchRoomDirectory(servers.registry);
      publicRooms = result.rooms;
      directoryErrors = result.errors;
    } catch {
      directoryErrors = servers.registry.map((server) => ({
        serverId: server.id,
        label: server.label,
      }));
    } finally {
      roomsLoading = false;
      renderRoomBrowser();
    }
  }
  function renderRoomBrowser() {
    const { store, servers, modeNames, esc } = context;
    if (store.view !== 'home') return;
    const section = $('#room-browser');
    if (!section) return;
    const visible = filterRoomDirectory(publicRooms, roomServerFilter),
      status = directoryStatus({
        rooms: publicRooms,
        errors: directoryErrors,
        registry: servers.registry,
        filter: roomServerFilter,
        loading: roomsLoading,
      });
    const template = document.createElement('template');
    template.innerHTML = `<div class="section-head"><div><h2 class="sr-only">Available rooms</h2><div class="server-toolbar room-directory-filter"><label for="room-server-filter">SHOW</label><select id="room-server-filter" aria-label="Filter rooms by server"><option value="all" ${roomServerFilter === 'all' ? 'selected' : ''}>All servers</option>${servers.registry.map((server) => `<option value="${esc(server.id)}" ${roomServerFilter === server.id ? 'selected' : ''}>${esc(server.label)}</option>`).join('')}</select></div><p id="room-browser-status" class="helper" role="status">${esc(status)}</p></div><button id="refresh-rooms" class="button small subtle" ${roomsLoading ? 'disabled' : ''}>${roomsLoading ? 'REFRESHING…' : 'REFRESH ↻'}</button></div><div class="room-browser-list">${visible.length ? visible.map((r) => `<article class="room-browser-card" data-room-key="${esc(r.key)}"><div><div class="room-browser-title">${esc(r.hostName || 'Player')}’s room <span class="tag room-server-tag" data-room-server-label="${esc(r.serverId)}">${esc(r.serverLabel)}</span><span class="tag">${r.private ? 'PRIVATE · PASSWORD' : 'PUBLIC'}</span></div><div class="room-browser-detail">${esc(r.code)} · ${r.memberCount} / ${r.capacity || 12} people · ${esc({ lobby: 'In the lobby', banning: 'Choosing bans', starting: 'Round starting', playing: 'Round in progress', finished: 'Between rounds' }[r.phase] || r.phase)}</div><div class="helper">${esc(MAP_CATALOG.find((st) => st.id === (r.roundSettings?.stage || r.settings?.stage))?.name || 'Arena')} · ${esc(modeNames[r.roundSettings?.mode || r.settings?.mode] || '')}</div></div><button class="button small ${r.private ? 'subtle' : 'primary'}" data-join-room="${esc(r.code)}" data-join-server="${esc(r.serverId)}" ${r.memberCount >= (r.capacity || 12) ? 'disabled' : ''}>${r.memberCount >= (r.capacity || 12) ? 'ROOM FULL' : r.private ? 'ENTER PASSWORD →' : ['starting', 'playing'].includes(r.phase) ? 'WATCH & JOIN →' : 'JOIN ROOM →'}</button></article>`).join('') : `<div class="empty-player">${roomsLoading ? 'CHECKING SERVERS…' : directoryErrors.some((error) => roomServerFilter === 'all' || error.serverId === roomServerFilter) ? 'ROOM LIST UNAVAILABLE FOR ONE OR MORE SERVERS.' : 'NO ROOMS AVAILABLE. CREATE A ROOM OR TRY A BOT MATCH.'}</div>`}</div>`;
    const list = section.querySelector('.room-browser-list');
    if (list) {
      list.replaceWith(template.content.querySelector('.room-browser-list'));
      $('#room-browser-status').textContent = status;
      $('#refresh-rooms').disabled = roomsLoading;
      $('#refresh-rooms').textContent = roomsLoading ? 'REFRESHING…' : 'REFRESH ↻';
    } else section.replaceChildren(template.content);
    $('#room-server-filter').onchange = (e) => {
      roomServerFilter = e.target.value;
      renderRoomBrowser();
    };
    $('#refresh-rooms').onclick = refreshRooms;
    section.querySelectorAll('[data-join-room]').forEach(
      (button) =>
        (button.onclick = () => {
          saveName();
          joinRoom(button.dataset.joinRoom, undefined, button.dataset.joinServer);
        }),
    );
  }
  async function joinRoom(code, password, serverId = context.servers.selected?.id) {
    const { servers, connection, profileClient, libraryClient, loadout, send, toast } = context;
    const sequence = ++directoryJoinSequence,
      target = servers.registry.find((server) => server.id === serverId);
    if (!target) {
      toast('That server is unavailable. Refresh the room list.');
      return;
    }
    if (
      !(await changeServer(target.id, { remember: false })) ||
      sequence !== directoryJoinSequence ||
      servers.selected?.id !== target.id
    )
      return;
    // A seat this tab left without leaving (a page load, the logo, Back) is still
    // held for reconnection. Resume it through the room link, as a reload does,
    // instead of joining again beside it.
    if (readRoomSession(target, code)) {
      location.assign(roomLocation(location.href, code, target.id));
      return;
    }
    profileClient.rememberRules(false);
    pendingJoinCode = code;
    loadout.resetSession();
    const listing = publicRooms.find(
      (entry) => entry.serverId === target.id && entry.code === code,
    );
    if (listing?.settings?.mechanicsVersion)
      loadout.selectEdition(listing.settings.mechanicsVersion);
    if (listing?.private && password === undefined) {
      showPasswordPrompt(code);
      return;
    }
    await libraryClient.load();
    if (
      sequence !== directoryJoinSequence ||
      servers.selected?.id !== target.id ||
      pendingJoinCode !== code ||
      !connection.id
    )
      return;
    send({
      type: 'join',
      code,
      ...profileClient.profile,
      team: profileClient.preferences.preferredTeam,
      teamColors: profileClient.preferences.teamColors,
      handicapPercent: profileClient.preferences.handicapPercent,
      loadout: loadout.serverLoadout(5),
      ...(password !== undefined ? { password } : {}),
    });
  }
  function showPasswordPrompt(code, error = '') {
    const { clearControls, esc } = context;
    clearControls();
    passwordDialog.innerHTML = `<form id="password-form"><div class="section-head"><h2>Join private room</h2><button class="icon-button" id="password-cancel" type="button" aria-label="Cancel joining private room">×</button></div><p class="helper">Room ${esc(code)} is protected. Ask the host for its password.</p><label for="join-password" class="label">ROOM PASSWORD</label><input id="join-password" type="password" maxlength="${PASSWORD_MAX_LENGTH}" autocomplete="off" required><p id="password-error" role="alert">${esc(error)}</p><button type="submit" class="button primary">JOIN ROOM ↗</button></form>`;
    $('#password-cancel').onclick = () => {
      passwordDialog.close();
      passwordDialog.replaceChildren();
      pendingJoinCode = null;
    };
    $('#password-form').onsubmit = (e) => {
      e.preventDefault();
      joinRoom(code, $('#join-password').value);
    };
    if (!passwordDialog.open) passwordDialog.showModal();
    $('#join-password').focus();
  }
  function tryInviteLink() {
    const { store } = context;
    if (linkJoinAttempted) return;
    const code = new URLSearchParams(location.search).get('room');
    if (!code) return;
    linkJoinAttempted = true;
    if (store.room?.code === code.toUpperCase()) return;
    joinRoom(code.slice(0, 8).toUpperCase());
  }

  function serverSelectorMarkup() {
    const { servers, esc } = context;
    return `<label for="server-select">CREATE ON</label><select id="server-select" aria-label="Server for new rooms" ${servers.registry.length ? '' : 'disabled'}>${servers.registry.length ? servers.registry.map((server) => `<option value="${esc(server.id)}" ${server.id === servers.creationServerId ? 'selected' : ''}>${esc(server.label)}${servers.ping(server.id) !== undefined ? ' · ' + servers.ping(server.id) + ' ms' : ''}</option>`).join('') : '<option>Connecting…</option>'}</select>`;
  }
  async function initializeServers() {
    const { servers, connection, libraryClient, toast } = context;
    await servers.initialize();
    renderHome();
    refreshRooms();
    measureServers();
    await connection
      .connect()
      .then(tryInviteLink)
      .catch(() => toast('This server is unavailable. Choose another server or refresh.'));
    libraryClient.load();
  }
  async function changeServer(serverId, { remember = true } = {}) {
    const { store, servers, connection, libraryClient, loadout, toast } = context;
    if (store.room) return false;
    const target = servers.registry.find((server) => server.id === serverId);
    if (!target) return false;
    if (remember) {
      directoryJoinSequence++;
      servers.setCreationServer(target.id);
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('server', target.id);
      history.replaceState(null, '', url);
    }
    if (target.id === servers.selected?.id) {
      if (remember) renderHome();
      try {
        await connection.connect();
        return !!connection.id;
      } catch {
        return false;
      }
    }
    loadout.disconnect();
    connection.disconnect();
    servers.select(target.id);
    libraryClient.reset();
    pendingJoinCode = null;
    linkJoinAttempted = true;
    $('#connection-status').textContent = 'CONNECTING…';
    renderHome();
    try {
      await connection.connect();
      if (servers.selected?.id !== target.id) return false;
      libraryClient.load();
      refreshRooms();
      return !!connection.id;
    } catch {
      toast('This server is unavailable. Choose another server or try again.');
      return false;
    }
  }
  async function measureServers() {
    const { store, servers } = context;
    await servers.measure();
    if (store.view === 'home') {
      const replayMenu = $('#replays-menu');
      if (replayMenu) replayMenu.innerHTML = replayLinkMarkup();
      const bar = $('.creation-server');
      if (bar) {
        bar.innerHTML = serverSelectorMarkup();
        $('#server-select').onchange = (e) => changeServer(e.target.value);
      }
    }
  }

  function frame(now) {
    const { store } = context;
    if (store.view === 'home') {
      const canvas = $('#demo-canvas');
      if (canvas) renderArena(canvas, demoState(now / 33));
    }
    animationFrame = requestAnimationFrame(frame);
  }
  let refreshTimer;
  function unmount() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  return {
    mount(root, nextContext) {
      app = root;
      context = nextContext;
      renderHome();
      if (animationFrame === null) animationFrame = requestAnimationFrame(frame);
    },
    unmount,
    initialize: initializeServers,
    startPolling() {
      refreshTimer ??= setInterval(() => {
        if (context.store.view === 'home') refreshRooms();
      }, 5000);
    },
    tryInviteLink,
    forgetMembership() {
      linkJoinAttempted = true;
    },
    resumeFailed() {
      linkJoinAttempted = false;
    },
    resetJoin() {
      pendingJoinCode = null;
    },
    receiveRoom() {
      if (pendingJoinCode === context.store.room?.code) {
        pendingJoinCode = null;
        passwordDialog.close();
        passwordDialog.replaceChildren();
      }
    },
    passwordError(message) {
      if (!['password_required', 'incorrect_password'].includes(message.code) || !pendingJoinCode)
        return false;
      showPasswordPrompt(
        pendingJoinCode,
        message.code === 'incorrect_password' ? message.message : '',
      );
      return true;
    },
    dispose() {
      unmount();
      clearInterval(refreshTimer);
      passwordDialog.remove();
    },
  };
}
