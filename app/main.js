import { createRoomUI } from './room-ui.js';
import { createRoomDock } from './room-dock.js';
import * as lobbyScreen from './screens/lobby.js';
import { createHomeScreen } from './screens/home.js';
import * as startingScreen from './screens/starting.js';
import * as banningScreen from './screens/banning.js';
import { createPracticeFlow } from './screens/practice.js';
import { createLoadoutController } from './loadout-controller.js';
import * as loadoutScreen from './screens/loadout.js';
import { createReadyControls } from './ready-controls.js';
import { createEditorState } from './editor-state.js';
import { createStore } from './store.js';
import { createInput } from './input.js';
import * as matchScreen from './screens/match.js';
import { installPlayerSettings } from './player-settings.js';
import { installArmMove } from './arm-move.js';
import { serverOrigin } from './servers.js';
import { createServersClient } from './servers-client.js';
import { createLibraryClient } from './library-client.js';
import { createConnection } from './connection.js';
import { createLoadoutManager } from './loadout-manager.js';
import { createAudio } from './audio.js';
import { createLobbySounds } from './lobby-sounds.js';
import { createProfileClient } from './profile-client.js';
import { settingLabels } from './room-settings-form.js';
import { mountFeedback } from './feedback.js';
import { mountAccount } from './account.js';
const $ = (s) => document.querySelector(s),
  app = $('#app');
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const account = mountAccount({ canReload: () => !store.room });
window.addEventListener('collection-changed', account.changed);
const profileClient = createProfileClient({
  changed: () => account.changed(),
  context: () => ({ room: store.room, id: connection.id }),
  send: (type, fields) => connection.send(type, fields),
});
const audio = createAudio({
  enabled: profileClient.preferences.sound,
  persist: profileClient.setSound,
});
const ensureAudio = audio.ensure;
const lobbySounds = createLobbySounds(audio.sound);
const servers = createServersClient();
const store = createStore();
const editorState = createEditorState();
let toastTimer;
const homeScreen = createHomeScreen();
const practice = createPracticeFlow({ store, send });
const input = createInput({
  context: () => ({
    room: store.room,
    round: store.round,
    state: store.state,
    view: store.view,
    id: connection.id,
    open: connection.open,
    hotkeys: [...profileClient.preferences.hotkeys],
    meleeHotkey: profileClient.preferences.meleeHotkey,
    dockOpen: dock.isOpen,
  }),
  send: (type, fields) => connection.send(type, fields),
  ensureAudio,
  hotkeyCapture: loadoutScreen.hotkeyCapture,
  closeDock: () => dock.close(),
});
const clearControls = input.clearControls;
const modeNames = settingLabels('mode');
const loadoutManager = createLoadoutManager({
  context: () => ({
    version: edition(),
    moves: loadout.draftNames(),
    hotkeys: [...profileClient.preferences.hotkeys],
    library: libraryClient.snapshot().moves,
    libraryStatus: libraryClient.snapshot().status,
    count: store.room?.settings.moves || 5,
    room: store.room ? servers.selected?.id + ':' + store.room.code : null,
    serverId: servers.selected?.id,
  }),
  guard: editorState.guard,
  beforeOpen: () => {
    loadoutScreen.stopHotkeyCapture();
    clearControls();
  },
  afterClose: () => clearControls(),
  notify: toast,
  retryLibrary: () => libraryClient.load(),
  changed: () => loadoutScreen.refreshFavorites(),
  apply: (...args) => loadout.applySavedLoadout(...args),
});
const edition = () => loadout.edition();
const libraryClient = createLibraryClient({
  context: () => ({
    room: store.room?.code,
    playerId: connection.id,
    mechanicsVersion: edition(),
    serverId: servers.selected?.id,
    origin: serverOrigin(servers.selected),
    token: connection.token,
  }),
  onStatusChange: () => readyControls.refresh(),
  onCatalogChange: () => loadoutManager.refresh(),
  onReady: loadoutScreen.libraryLoaded,
  onProgress: loadoutScreen.feedback,
  onSettled: () => {
    loadout.sync();
    loadoutScreen.feedback();
  },
});
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 5500);
}
const connection = createConnection({
  context: () => ({ server: servers.selected, room: store.room?.code }),
  notify: toast,
  onStatus: (status) => {
    $('#connection-status').textContent = status;
  },
  onReadyChange: () => readyControls.refresh(),
  onReconnect: () => {
    if (!store.room) homeScreen.tryInviteLink();
    readyControls.refresh();
  },
  onDisconnect: () => {
    loadout.disconnect();
  },
  onOffline: () => {
    clearControls();
    readyControls.refresh();
  },
  onMembershipForgotten: homeScreen.forgetMembership,
  onSessionReplaced: () => {
    store.clearRoom();
    toast('This seat was opened in another tab. You can join again as a new player.');
  },
  onLatency: (latency) => {
    const ping = $('#ping');
    if (ping) ping.textContent = latency + ' MS';
  },
  handlers: {
    resumed() {
      store.clearRoom();
    },
    resumeFailed(m) {
      store.clearRoom();
      loadout.resetSession();
      homeScreen.resumeFailed();
      toast(m.message || 'Your previous seat expired. Joining the room again.');
    },
    room(m, { resuming, finishResume }) {
      const previousRoom = store.room;
      if (previousRoom?.code !== m.room.code) dock.resetRoom();
      const { changed, reset } = store.setRoom(m.room);
      lobbySounds.room(previousRoom, store.room, { id: connection.id, resuming });
      if (previousRoom?.inputRevision !== store.room.inputRevision) clearControls();
      loadout.receiveRoom(previousRoom, store.room, {
        resuming,
        afterRestore: () => {
          // Resume input sequence numbers after the last acknowledged press, even mid-round.
          input.resetPresses({ resuming: true });
          finishResume();
        },
      });
      connection.rememberMembership();
      if (changed) input.resetPresses();
      profileClient.receiveRoom();
      input.captureRoundBindings();
      if (previousRoom?.settings.moves !== store.room.settings.moves) setTimeout(loadout.sync, 0);
      homeScreen.receiveRoom();
      if (reset) clearControls();
      practice.advance();
    },
    round(m) {
      store.setRound(m);
    },
    tick(m) {
      const accepted = store.applyTick(m, performance.now());
      if (!accepted) return;
      input.acknowledge(m.inputAcks?.[connection.id] || 0);
      matchScreen.receive(accepted.state, `${store.room.code}:${store.room.roundNumber}`);
      audio.playState(accepted.state, accepted.previousState, connection.id);
    },
    latency(m) {
      store.applyLatency(m);
    },
    kicked(m) {
      connection.forgetMembership();
      store.clearRoom();
      loadout.resetSession();
      practice.reset();
      profileClient.rememberRules(false);
      homeScreen.resetJoin();
      dock.hide();
      loadout.resetEditing();
      clearControls();
      toast(m.message);
    },
    chat(m) {
      const accepted = store.appendChat(m);
      if (!accepted) return;
      if (accepted.added) {
        lobbySounds.chat(m.message, connection.id);
        dock.receiveChat();
      }
    },
    error(m) {
      if (!homeScreen.passwordError(m)) toast(m.message);
      practice.reset();
    },
    left() {
      connection.forgetMembership();
      store.clearRoom();
    },
  },
});
const loadout = createLoadoutController({
  store,
  connection,
  servers,
  profileClient,
  libraryClient,
  input,
  toast,
  ui: {
    feedback: loadoutScreen.feedback,
    closeSuggestions: loadoutScreen.closeSuggestions,
    refreshHotkeys: loadoutScreen.refreshHotkeys,
    refreshRecommended: loadoutScreen.refreshRecommendedLoadouts,
    resetAutocomplete: loadoutScreen.resetAutocomplete,
    writeSlot: loadoutScreen.writeSlot,
    updateHUD: matchScreen.updateHUD,
  },
});
const readyControls = createReadyControls({
  store,
  connection,
  libraryClient,
  loadoutManager,
  loadout,
  member,
  selectedPlayers,
  esc,
  refreshRecommendedLoadouts: loadoutScreen.refreshRecommendedLoadouts,
});
const roomUI = createRoomUI({
  store,
  connection,
  servers,
  profileClient,
  loadout: loadoutScreen,
  ready: readyControls,
  roomLibrary: loadout.roomLibrary,
  send,
  toast,
  leave,
  esc,
});
const dock = createRoomDock({
  app,
  store,
  ui: roomUI,
  loadout: loadoutScreen,
  ready: readyControls,
  editor: editorState,
  send,
  clearControls,
  esc,
});
const renderDock = dock.render,
  positionRoomDock = dock.position,
  openRoomPanel = dock.open;
loadoutScreen.mount(document, {
  store,
  connection,
  profileClient,
  libraryClient,
  loadoutManager,
  loadout,
  input,
  clearControls,
  updateHUD: matchScreen.updateHUD,
  editorState,
  toast,
  esc,
  member,
  refreshReadyControl: readyControls.refresh,
  renderEditor: () => {
    if (store.view === 'lobby') renderLobby();
    else renderDock();
  },
});
// Store notifications redraw at most once per frame. Packet effects above remain immediate.
store.subscribe((snapshot, changes) => {
  if (changes.room) account.resumeSync();
  if (changes.room || changes.view) render();
  else {
    if (changes.state) {
      if (!$('#game-canvas')) renderMatch();
      else matchScreen.updateHUD();
    }
    if (changes.chat) {
      dock.refreshChat();
    }
    if (changes.latency)
      for (const player of snapshot.room.players) {
        const element = document.querySelector(`[data-ping-player="${player.id}"]`);
        if (element) element.textContent = roomUI.pingLabel(player);
      }
  }
});
function send({ type, ...fields }) {
  connection.send(type, fields);
}

function render() {
  editorState.guard(renderView);
}
function renderView() {
  if (store.view !== 'match') matchScreen.unmount();
  loadoutManager.refresh();
  const editor = editorState.capture();
  if (store.room?.phase !== 'starting') startingScreen.unmount();
  if (store.room?.phase !== 'banning') banningScreen.unmount();
  if (!store.room) {
    renderHome();
    dock.hide();
    return;
  }
  homeScreen.unmount();
  if (['playing', 'finished'].includes(store.room.phase)) {
    if (!$('#game-canvas')) renderMatch();
    else matchScreen.updateHUD();
  } else if (store.room.phase === 'banning') {
    renderBanning();
  } else if (store.room.phase === 'starting') {
    renderStarting();
  } else {
    renderLobby();
  }
  renderDock();
  editorState.restore(editor);
}

function selectedPlayers() {
  return roomUI.selectedPlayers();
}
function member() {
  return roomUI.member();
}
function leave() {
  loadout.reset();
  connection.cancelReconnect();
  connection.forgetMembership();
  profileClient.rememberRules(false);
  send({ type: 'leave' });
  store.clearRoom();
  practice.reset();
  dock.leave();
  clearControls();
}
function renderLobby() {
  lobbyScreen.mount(app, {
    ui: roomUI,
    editor: editorState,
    dock,
    loadout: loadoutScreen,
    ready: readyControls,
  });
}
setInterval(libraryClient.poll, 1000);
function renderHome() {
  homeScreen.mount(app, {
    store,
    servers,
    connection,
    profileClient,
    libraryClient,
    loadout,
    practice,
    stopHotkeyCapture: loadoutScreen.unmount,
    clearControls,
    send,
    toast,
    modeNames,
    esc,
  });
}
function renderStarting() {
  startingScreen.mount(app, { store, connection, ui: roomUI, modeNames });
}
function renderBanning() {
  banningScreen.mount(app, { store, connection, ui: roomUI, send });
}
function renderMatch() {
  matchScreen.mount(app, {
    store,
    connection,
    servers,
    input,
    esc,
    modeNames,
    member,
    send,
    leave,
    openRoomPanel,
    positionRoomDock,
    renderDock,
    get dockOpen() {
      return dock.isOpen;
    },
  });
}
audio.mountToggle($('#audio-toggle'));
document.addEventListener('pointerdown', () => ensureAudio(), { once: true });
installPlayerSettings(document);
installArmMove(document, (name, slot) => store.room && loadoutScreen.selectMove(slot, name));
input.install();
window.addEventListener('account-identity-changed', () => connection.refreshIdentity());
connection.startPings();
window.__rando = {
  get server() {
    return servers.selected;
  },
  get state() {
    return store.state;
  },
  get room() {
    return store.room;
  },
  get id() {
    return connection.id;
  },
  get preferences() {
    return profileClient.preferences;
  },
  send,
};
renderHome();
mountFeedback({
  context: () => ({
    origin: serverOrigin(servers.selected),
    page: store.view,
    room: store.room?.code,
  }),
});
loadoutManager.readShare();
window.addEventListener('hashchange', () => loadoutManager.readShare());
homeScreen.initialize();
homeScreen.startPolling();
