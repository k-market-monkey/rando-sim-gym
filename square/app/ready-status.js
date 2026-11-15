import { moveProgressText } from './move-progress.js';

// Describe the first thing a player can fix, using the same complete, distinct
// library loadout the room service requires. Server acknowledgement is separate
// from local validity so a delayed socket update never looks like a bad move.
export function readyStatus({
  connected = true,
  member,
  moveCount = 3,
  names = [],
  libraryStatus = 'ready',
  libraryNames = [],
  // Library moves that need a feature this room has turned off.
  disabledNames = [],
  claimedNames = {},
  editingSlots = new Set(),
  pendingBySlot = [],
  errorsBySlot = [],
  generationEnabled = true,
  // Built-in actions ({action, label}) without a key; each needs one to play.
  missingBuiltins = [],
} = {}) {
  const actions = (...items) => items.filter(Boolean);
  const action = (type, label, slot) => ({ type, label, ...(slot === undefined ? {} : { slot }) });
  const focus = (slot) => action('focus', `EDIT MOVE ${slot + 1}`, slot);
  const existing = new Set(libraryNames),
    disabled = new Set(disabledNames),
    claimOwners = new Map(Object.entries(claimedNames));
  const randomize =
    libraryNames.filter((name) => !disabled.has(name) && !claimOwners.has(name)).length >= moveCount
      ? action('randomize', 'USE RANDOM LIBRARY MOVES')
      : null;
  const result = (reason, message, items = [], extra = {}) => ({
    reason,
    message,
    actions: items,
    canReady: reason === 'ready',
    canToggle:
      connected &&
      !!member &&
      member.connected !== false &&
      member.queued !== false &&
      (member.ready || reason === 'ready'),
    busy: false,
    ...extra,
  });
  if (!connected || !member || member.connected === false)
    return result(
      'disconnected',
      'Disconnected from the room. Reconnect to save your loadout and get ready.',
      [action('reconnect', 'RECONNECT')],
    );
  if (member.queued === false)
    return result('spectating', 'You are spectating. Join the next round to get ready.', [
      action('join', 'JOIN NEXT ROUND'),
    ]);
  if (libraryStatus === 'error')
    return result(
      'library-error',
      'The move library could not load. Retry to check your saved moves.',
      [action('library', 'RETRY LIBRARY')],
    );
  if (libraryStatus !== 'ready')
    return result(
      'library-loading',
      'Loading the move library before checking your loadout…',
      [action('library', 'RETRY LIBRARY')],
      { busy: true },
    );
  const seen = new Set();
  for (let slot = 0; slot < moveCount; slot++) {
    const name = names[slot] || '',
      number = slot + 1;
    if (!name.trim())
      return result(
        'empty',
        `Move ${number} is empty. Choose a move for every slot.`,
        actions(focus(slot), randomize),
        { slot },
      );
    if (!/^[a-z0-9 ]{1,14}$/.test(name))
      return result(
        'invalid',
        `Move ${number} must use 1–14 lowercase letters, digits and spaces.`,
        actions(focus(slot), randomize),
        { slot },
      );
    if (seen.has(name))
      return result(
        'duplicate',
        `Move ${number} repeats “${name}”. Each slot needs a different move.`,
        actions(focus(slot), randomize),
        { slot },
      );
    seen.add(name);
    if (disabled.has(name))
      return result(
        'feature-off',
        `Move ${number}, “${name}”, needs a feature this room has turned off. Choose another move.`,
        actions(focus(slot), randomize),
        { slot },
      );
    if (claimOwners.has(name))
      return result(
        'move-claimed',
        `Move ${number}, “${name}”, is held by ${claimOwners.get(name)}. Choose another move or ask them to release it.`,
        actions(action('focus', 'CHOOSE ANOTHER MOVE', slot), randomize),
        { slot },
      );
    if (editingSlots.has(slot))
      return result(
        'unlocked',
        `Move ${number} is still being edited. ${generationEnabled || existing.has(name) ? 'Confirm it with ✓, Enter or Tab.' : 'Custom generation is unavailable; choose an existing move.'}`,
        actions(
          generationEnabled || existing.has(name)
            ? action('lock', `CONFIRM MOVE ${number}`, slot)
            : null,
          focus(slot),
          randomize,
        ),
        { slot },
      );
    const pending = pendingBySlot[slot];
    if (pending)
      return result(
        'generating',
        `Move ${number}: ${moveProgressText(pending.progress)} You can wait or choose an existing move.`,
        actions(action('focus', 'CHOOSE AN EXISTING MOVE', slot), randomize),
        { slot, busy: true, progressPhase: pending.progress?.phase || 'requesting' },
      );
    if (!existing.has(name)) {
      const error = errorsBySlot[slot];
      if (error?.name === name)
        return result(
          'move-error',
          `Move ${number}: ${error.message}`,
          actions(
            generationEnabled ? action('lock', `RETRY MOVE ${number}`, slot) : null,
            focus(slot),
            randomize,
          ),
          { slot },
        );
      return result(
        'unknown',
        `Move ${number}, “${name}”, is not in this move library. ${generationEnabled ? 'Confirm it to create it, or choose an existing move.' : 'Choose an existing move.'}`,
        actions(
          generationEnabled ? action('lock', `CREATE MOVE ${number}`, slot) : null,
          focus(slot),
          randomize,
        ),
        { slot },
      );
    }
  }
  if (missingBuiltins.length) {
    const [{ action: builtin, label }] = missingBuiltins;
    return result(
      'builtin-hotkey',
      `${label} has no key. Every built-in action needs its own key.`,
      [{ type: 'hotkey', label: `SET ${label.toUpperCase()} KEY`, builtin }],
      { builtin },
    );
  }
  if (
    member.loadout?.length !== moveCount ||
    names.slice(0, moveCount).some((name, slot) => name !== member.loadout[slot])
  )
    return result(
      'syncing',
      'Saving your loadout to the room… If this takes a moment, try syncing again.',
      [action('sync', 'RETRY SYNC')],
      { busy: true },
    );
  return result(
    'ready',
    member.ready
      ? 'You are ready for the next round.'
      : 'Your loadout is saved. You can get ready.',
  );
}

export function startStatus({
  connected = true,
  players = [],
  moveCount = 3,
  teamBattle = false,
  canAddBot = true,
} = {}) {
  const blocked = (reason, message, action) => ({ canStart: false, reason, message, action });
  const names = (list) => list.map((player) => player.name || 'Player').join(', ');
  if (!connected)
    return blocked('disconnected', 'Reconnect before starting the match.', {
      type: 'reconnect',
      label: 'RECONNECT',
    });
  if (players.length < 2)
    return blocked('players', 'At least two fighters are needed. Invite a friend or add a bot.', {
      type: canAddBot ? 'add-bot' : 'players',
      label: canAddBot ? 'ADD A BOT' : 'VIEW PLAYERS',
    });
  const disconnected = players.filter((player) => player.connected === false);
  if (disconnected.length)
    return blocked('player-disconnected', `Waiting for ${names(disconnected)} to reconnect.`, {
      type: 'players',
      label: 'VIEW PLAYERS',
    });
  if (teamBattle && new Set(players.map((player) => player.team).filter(Boolean)).size < 2)
    return blocked('teams', 'Choose at least two opposing teams before starting.', {
      type: 'team',
      label: 'CHANGE YOUR TEAM',
    });
  const incomplete = players.filter(
    (player) => player.loadout?.length !== moveCount || !player.loadout.every(Boolean),
  );
  if (incomplete.length)
    return blocked(
      'loadouts',
      `${names(incomplete)} ${incomplete.length === 1 ? 'needs' : 'need'} to fill every move slot.`,
      { type: 'players', label: 'VIEW PLAYERS' },
    );
  const unready = players.filter((player) => !player.ready);
  if (unready.length)
    return blocked('readiness', `Waiting for ${names(unready)} to get ready.`, {
      type: 'players',
      label: 'VIEW PLAYERS',
    });
  return {
    canStart: true,
    reason: 'ready',
    message: 'All selected fighters are ready. You can start the match.',
  };
}
