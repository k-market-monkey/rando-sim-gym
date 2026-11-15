import { DEFAULT_MECHANICS_VERSION } from '../shared/protocol/versions.js';
import { starterLoadout } from './starter-loadout.js';
import { LOADOUT_PRESETS, applyLoadoutPreset } from './loadout-presets.js';
import { readyStatus } from './ready-status.js';
import { BUILTIN_LABELS, missingBuiltinHotkeys } from './preferences.js';

/** Own next-round drafts, validation and room acknowledgements independently of rendering. */
export function createLoadoutController({
  store,
  connection,
  servers,
  profileClient,
  libraryClient,
  input,
  ui,
  toast,
}) {
  let sessionLoadout = null,
    loadoutSyncTimer,
    automaticLoadoutSync = null,
    pendingLoadoutSend = null;
  const editingSlots = new Set(),
    moveErrors = new Map();
  const member = () => store.room?.players.find((p) => p.id === connection.id);
  const edition = () =>
    store.room?.settings.mechanicsVersion ||
    profileClient.preferences.activeMechanicsVersion ||
    DEFAULT_MECHANICS_VERSION;
  const send = ({ type, ...fields }) => connection.send(type, fields);
  const clearControls = input.clearControls;
  const {
    feedback: renderLoadoutFeedback,
    closeSuggestions,
    refreshHotkeys: refreshHotkeyButtons,
    refreshRecommended: refreshRecommendedLoadouts,
  } = ui;
  // A library move that needs a feature this room has turned off. The room refuses
  // it, so it is left out of suggestions and of the loadout sent to the room.
  const featureOff = (move) =>
    !!move?.features?.some((feature) => store.room?.settings.disabledFeatures?.includes(feature));
  const turnedOff = (name) =>
    featureOff(libraryClient.snapshot().moves.find((move) => move.name === name));
  const roomLibrary = () => libraryClient.snapshot().moves.filter((move) => !featureOff(move));
  function claimedBy(name) {
    if (!store.room?.settings.exclusiveMoves || member()?.queued === false) return null;
    const id = Object.hasOwn(store.room.moveClaims || {}, name)
      ? store.room.moveClaims[name]
      : null;
    return id && id !== connection.id ? store.room.players.find((p) => p.id === id) : null;
  }
  function draftNames() {
    return [...(sessionLoadout || profileClient.preferences.loadout)];
  }

  function knownName(name) {
    return (
      starterLoadout(edition()).includes(name) ||
      libraryClient.snapshot().moves.some((move) => move.name === name)
    );
  }

  function serverLoadout(count = store.room?.settings.moves || 3) {
    const seen = new Set();
    return Array.from({ length: count }, (_, i) => {
      const name = draftNames()[i] || '';
      if (
        editingSlots.has(i) ||
        !knownName(name) ||
        turnedOff(name) ||
        claimedBy(name) ||
        seen.has(name)
      )
        return '';
      seen.add(name);
      return name;
    });
  }

  function currentReadyStatus() {
    return readyStatus({
      connected: connection.ready,
      member: member(),
      moveCount: store.room?.settings.moves,
      names: draftNames(),
      libraryStatus: libraryClient.snapshot().status,
      libraryNames: libraryClient.snapshot().moves.map((move) => move.name),
      disabledNames: libraryClient
        .snapshot()
        .moves.filter(featureOff)
        .map((move) => move.name),
      editingSlots,
      pendingBySlot: draftNames().map((name) => libraryClient.pending(name)),
      errorsBySlot: draftNames().map((_, slot) => moveErrors.get(slot)),
      claimedNames: Object.fromEntries(
        draftNames().flatMap((name) => {
          const holder = claimedBy(name);
          return holder ? [[name, holder.name]] : [];
        }),
      ),
      generationEnabled: libraryClient.snapshot().generationEnabled,
      missingBuiltins: missingBuiltinHotkeys(profileClient.preferences, edition()).map(
        (action) => ({ action, label: BUILTIN_LABELS[action] }),
      ),
    });
  }

  function loadoutContextMatches(value) {
    return (
      value &&
      store.room &&
      value.room === store.room.code &&
      value.server === servers.selected?.id &&
      value.version === edition() &&
      value.count === store.room.settings.moves &&
      value.revision === store.room.loadoutRulesRevision &&
      (value.claims === undefined || value.claims === JSON.stringify(store.room.moveClaims))
    );
  }

  function syncLoadout() {
    if (
      !store.room ||
      !member() ||
      !connection.ready ||
      libraryClient.snapshot().status !== 'ready'
    )
      return;
    const names = serverLoadout(),
      pendingNames = draftNames()
        .slice(0, store.room.settings.moves)
        .filter(
          (name, slot) =>
            !editingSlots.has(slot) &&
            !knownName(name) &&
            !claimedBy(name) &&
            libraryClient.pending(name),
        ),
      pendingEncoded = JSON.stringify(pendingNames),
      encoded = JSON.stringify(names),
      pending = automaticLoadoutSync;
    const automatic =
      loadoutContextMatches(pending) && pending.draft === JSON.stringify(draftNames());
    if (!loadoutContextMatches(pendingLoadoutSend)) pendingLoadoutSend = null;
    automaticLoadoutSync = null;
    if (pendingLoadoutSend?.names === encoded && pendingLoadoutSend.pendingNames === pendingEncoded)
      return;
    if (
      encoded === JSON.stringify(member().loadout) &&
      pendingEncoded === JSON.stringify(member().pendingGenerationNames || []) &&
      !pendingLoadoutSend
    )
      return;
    pendingLoadoutSend = {
      room: store.room.code,
      server: servers.selected?.id,
      version: edition(),
      count: store.room.settings.moves,
      revision: store.room.loadoutRulesRevision,
      claims: JSON.stringify(store.room.moveClaims),
      names: encoded,
      pendingNames: pendingEncoded,
    };
    send({
      type: 'loadout',
      names,
      ...(pendingNames.length || member().pendingGenerationNames?.length ? { pendingNames } : {}),
      ...(automatic ? { rulesRevision: pending.revision } : {}),
    });
  }

  function changeDraft(slot, name) {
    automaticLoadoutSync = null;
    editingSlots.add(slot);
    moveErrors.delete(slot);
    if (sessionLoadout) sessionLoadout[slot] = name;
    profileClient.setMove(slot, name);
    clearTimeout(loadoutSyncTimer);
    loadoutSyncTimer = setTimeout(syncLoadout, 120);
    renderLoadoutFeedback();
  }

  function applySavedLoadout(moves, hotkeys) {
    automaticLoadoutSync = null;
    if (!store.room || libraryClient.snapshot().status !== 'ready') return;
    clearTimeout(loadoutSyncTimer);
    editingSlots.clear();
    moveErrors.clear();
    ui.resetAutocomplete();
    if (sessionLoadout) sessionLoadout = [...moves];
    profileClient.setLoadout(moves, hotkeys);
    for (let slot = 0; slot < store.room.settings.moves; slot++) {
      ui.writeSlot(slot, moves[slot] || '');
      closeSuggestions(slot);
    }
    clearControls();
    syncLoadout();
    refreshHotkeyButtons();
    renderLoadoutFeedback();
  }

  function randomizeLoadout() {
    automaticLoadoutSync = null;
    if (!store.room) return;
    const count = store.room.settings.moves,
      pool = [
        ...new Set(
          roomLibrary()
            .filter((move) => !claimedBy(move.name))
            .map((move) => move.name),
        ),
      ];
    if (pool.length < count) {
      toast(
        'Not enough unclaimed library moves are available. Choose moves individually or turn off Exclusive moves.',
      );
      return;
    }
    clearTimeout(loadoutSyncTimer);
    ui.resetAutocomplete();
    const next = [...profileClient.preferences.loadout];
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      editingSlots.delete(i);
      moveErrors.delete(i);
      next[i] = pool[i];
      if (sessionLoadout) sessionLoadout[i] = pool[i];
      ui.writeSlot(i, pool[i]);
      closeSuggestions(i);
    }
    profileClient.setLoadout(next);
    syncLoadout();
    renderLoadoutFeedback();
  }

  function useRecommendedLoadout(presetId) {
    const preset = LOADOUT_PRESETS.find(
      (item) => item.id === presetId && item.mechanicsVersion === edition(),
    );
    if (
      !store.room ||
      !preset ||
      !connection.ready ||
      libraryClient.snapshot().status !== 'ready' ||
      preset.names
        .slice(0, store.room.settings.moves)
        .some((name) => claimedBy(name) || !roomLibrary().some((move) => move.name === name))
    ) {
      refreshRecommendedLoadouts();
      return;
    }
    automaticLoadoutSync = null;
    const count = store.room.settings.moves,
      current = [...draftNames()],
      next = applyLoadoutPreset(preset, current, count),
      saved = [...profileClient.preferences.loadout];
    clearTimeout(loadoutSyncTimer);
    ui.resetAutocomplete();
    for (let slot = 0; slot < count; slot++) {
      if (slot < preset.names.length || next[slot] !== current[slot]) {
        editingSlots.delete(slot);
        moveErrors.delete(slot);
      }
      saved[slot] = next[slot];
      if (sessionLoadout) sessionLoadout[slot] = next[slot];
      ui.writeSlot(slot, next[slot]);
      closeSuggestions(slot);
    }
    profileClient.setLoadout(saved);
    syncLoadout();
    renderLoadoutFeedback();
    toast(`${preset.label} loadout selected.`);
  }

  function setHotkey(slot, code) {
    profileClient.setHotkeys(
      profileClient.preferences.hotkeys.map((key, i) =>
        i === slot ? code : code && key === code ? '' : key,
      ),
    );
    input.updateBinding(draftNames()[slot], code);
    clearControls();
    ui.updateHUD();
    return true;
  }

  function lockMove(slot, retry = false) {
    if (!store.room || slot >= store.room.settings.moves) return;
    let name = draftNames()[slot] || '';
    const normalized = name;
    if (normalized !== name) {
      name = normalized;
      changeDraft(slot, name);
      ui.writeSlot(slot, name);
    }
    const valid = /^[a-z0-9 ]{1,14}$/.test(name),
      duplicate =
        !!name &&
        draftNames()
          .slice(0, store.room.settings.moves)
          .some((n, i) => i !== slot && n === name);
    editingSlots.delete(slot);
    clearTimeout(loadoutSyncTimer);
    if (!name || !valid || duplicate) {
      syncLoadout();
      renderLoadoutFeedback();
      return;
    }
    if (knownName(name)) {
      moveErrors.delete(slot);
      syncLoadout();
      renderLoadoutFeedback();
      return;
    }
    if (!libraryClient.snapshot().generationEnabled) {
      moveErrors.set(slot, {
        name,
        message: 'Custom generation is unavailable. Choose an existing library move.',
      });
      syncLoadout();
      renderLoadoutFeedback();
      return;
    }
    if (libraryClient.pending(name) || (!retry && moveErrors.get(slot)?.name === name)) {
      renderLoadoutFeedback();
      return;
    }
    if (libraryClient.pendingCount >= 5) {
      moveErrors.set(slot, {
        name,
        message: 'Five moves are generating. Retry when one finishes.',
      });
      renderLoadoutFeedback();
      return;
    }
    moveErrors.delete(slot);
    libraryClient.generate(name, {
      onError: (message) => {
        if (draftNames()[slot] === name) moveErrors.set(slot, { name, message });
      },
    });
    syncLoadout();
  }
  function selectEdition(version) {
    if (!profileClient.selectEdition(version)) return;
    sessionLoadout = null;
    editingSlots.clear();
    moveErrors.clear();
    libraryClient.reset();
  }
  function receiveRoom(previousRoom, room, { resuming = false, afterRestore = () => {} } = {}) {
    const previousDraftEditing = editingSlots.size > 0,
      previousEdition =
        previousRoom?.settings.mechanicsVersion ||
        profileClient.preferences.activeMechanicsVersion ||
        DEFAULT_MECHANICS_VERSION;
    if (previousRoom?.code !== room.code) {
      automaticLoadoutSync = null;
      pendingLoadoutSend = null;
      resetEditing();
    }
    selectEdition(room.settings.mechanicsVersion);
    if (previousEdition !== edition() || !libraryClient.snapshot().moves.length)
      libraryClient.load();
    if (resuming) {
      const restored = member();
      if (restored) {
        sessionLoadout = Array.from(
          { length: 5 },
          (_, i) => restored.loadout[i] || profileClient.preferences.loadout[i] || '',
        );
        profileClient.setLoadout(sessionLoadout);
      }
      afterRestore();
    }
    if (
      pendingLoadoutSend &&
      (!loadoutContextMatches(pendingLoadoutSend) ||
        (pendingLoadoutSend.names === JSON.stringify(member()?.loadout) &&
          pendingLoadoutSend.pendingNames ===
            JSON.stringify(member()?.pendingGenerationNames || [])))
    )
      pendingLoadoutSend = null;
    const rulesChanged =
      previousRoom?.code === room.code &&
      previousRoom?.loadoutRulesRevision !== room.loadoutRulesRevision &&
      (previousRoom?.settings.moves !== room.settings.moves || previousEdition !== edition());
    if (rulesChanged || resuming)
      automaticLoadoutSync =
        !previousDraftEditing &&
        Number.isSafeInteger(room.loadoutRulesRevision) &&
        member()?.pendingLoadoutRulesRevision === room.loadoutRulesRevision
          ? {
              room: room.code,
              server: servers.selected?.id,
              version: edition(),
              count: room.settings.moves,
              revision: room.loadoutRulesRevision,
              draft: JSON.stringify(draftNames()),
            }
          : null;
  }
  function resetEditing() {
    editingSlots.clear();
    moveErrors.clear();
  }
  function resetSession() {
    sessionLoadout = null;
  }
  function disconnect() {
    pendingLoadoutSend = null;
  }
  function reset() {
    automaticLoadoutSync = null;
    pendingLoadoutSend = null;
    sessionLoadout = null;
    resetEditing();
  }
  function prepareCreate(bot) {
    sessionLoadout =
      bot && serverLoadout(3).some((name) => !name) ? [...starterLoadout(edition()), '', ''] : null;
  }
  function libraryLoaded() {
    for (const [slot, error] of moveErrors)
      if (libraryClient.snapshot().moves.some((move) => move.name === error.name))
        moveErrors.delete(slot);
  }
  return {
    edition,
    draftNames,
    knownName,
    turnedOff,
    roomLibrary,
    claimedBy,
    serverLoadout,
    currentReadyStatus,
    sync: syncLoadout,
    changeDraft,
    applySavedLoadout,
    randomize: randomizeLoadout,
    useRecommendedLoadout,
    setHotkey,
    lockMove,
    selectEdition,
    receiveRoom,
    resetSession,
    resetEditing,
    reset,
    disconnect,
    prepareCreate,
    libraryLoaded,
    isEditing: (slot) => editingSlots.has(slot),
    error: (slot) => (moveErrors.has(slot) ? { ...moveErrors.get(slot) } : undefined),
  };
}
