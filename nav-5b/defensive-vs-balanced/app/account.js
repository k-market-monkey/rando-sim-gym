import { loadPreferences, savePreferences, PREFERENCES_KEY } from './preferences.js';
import { loadExtraPreferences, saveExtraPreferences } from './extra-preferences.js';
import { ROOM_SETTINGS_KEY } from './room-settings.js';
import { PLAYER_SETTINGS_KEY } from './player-settings.js';
import { readCollection, writeCollection, COLLECTION_KEY } from './loadout-collection.js';
import { syncData, sameData, reconcileData } from './account-sync.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const BASELINE = 'rando.account.sync.v1.';
const GUEST_BASELINE = 'rando.account.guest.v1';
const APPLYING_CLOUD = 'rando.account.applying-cloud';

// Account credentials live only in the server's HttpOnly cookie.
export function mountAccount({ canReload = () => true } = {}) {
  const button = document.createElement('button');
  button.className = 'button small subtle';
  button.id = 'account-open';
  button.textContent = 'ACCOUNT';
  document.querySelector('.header-right').prepend(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  document.body.append(dialog);
  let account = null,
    capabilities = {},
    mode = 'loading',
    message = '',
    timer,
    saving = false,
    busy = true,
    epoch = 0,
    dirty = false,
    pendingEmail = '',
    applyingCloudElsewhere = false,
    applyingCloud = false,
    baseline = null,
    conflicts = [];
  const freshDevice = ![
    PREFERENCES_KEY,
    COLLECTION_KEY,
    ROOM_SETTINGS_KEY,
    PLAYER_SETTINGS_KEY,
  ].some((key) => {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return true;
    }
  });
  const request = async (path, method = 'GET', body) => {
    const response = await fetch('/api/account/' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(data.error || 'unavailable'), {
        status: response.status,
        data,
      });
    return data;
  };
  function localData() {
    return syncData({
      preferences: loadPreferences(),
      collection: readCollection(),
      extraPreferences: loadExtraPreferences(),
    });
  }
  const initialLocal = localData();
  let guestBaseline = null;
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_BASELINE));
    guestBaseline = saved ? syncData(saved) : null;
    if (freshDevice) {
      guestBaseline = initialLocal;
      localStorage.setItem(GUEST_BASELINE, JSON.stringify(guestBaseline));
    }
  } catch {}
  function cloudData() {
    return syncData({
      ...account,
      // Older cloud saves do not include room/display settings.
      extraPreferences: account.extraPreferences || loadExtraPreferences(),
    });
  }
  function readBaseline() {
    try {
      const saved = JSON.parse(localStorage.getItem(BASELINE + account.id));
      if (
        Number.isSafeInteger(saved?.revision) &&
        saved.revision >= 0 &&
        saved.revision <= account.revision &&
        saved.data
      )
        return { revision: saved.revision, data: syncData(saved.data) };
    } catch {}
    return null;
  }
  function remember(data = cloudData()) {
    baseline = { revision: account.revision, data };
    try {
      localStorage.setItem(BASELINE + account.id, JSON.stringify(baseline));
    } catch {}
  }
  function applyData(data) {
    applyingCloud = true;
    clearTimeout(timer);
    let applied = false;
    const previous = new Map();
    try {
      for (const key of [PREFERENCES_KEY, COLLECTION_KEY, ROOM_SETTINGS_KEY, PLAYER_SETTINGS_KEY])
        previous.set(key, localStorage.getItem(key));
      localStorage.setItem(APPLYING_CLOUD, '1');
      applied =
        savePreferences(data.preferences) &&
        writeCollection(data.collection) &&
        saveExtraPreferences(data.extraPreferences);
      if (!applied) throw Error('storage_unavailable');
    } catch {
      // Roll back partial writes where storage permits; never upload them.
      for (const [key, value] of previous) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {}
      }
    } finally {
      applyingCloud = false;
      try {
        localStorage.removeItem(APPLYING_CLOUD);
      } catch {}
    }
    if (!applied) {
      mode = 'retry';
      message =
        'Could not save to this device. Your cloud data is unchanged. Retry when storage is available.';
    }
    return applied;
  }
  function reconcile() {
    conflicts = [];
    const local = localData();
    if (!account.preferences) {
      mode = 'sync';
      dirty = true;
      return;
    }
    const cloud = cloudData();
    const result = baseline
      ? reconcileData(baseline.data, local, cloud)
      : sameData(local, cloud) || (guestBaseline && sameData(local, guestBaseline))
        ? { data: cloud, conflicts: [] }
        : { data: local, conflicts: ['unrecognized device data'] };
    conflicts = result.conflicts;
    if (conflicts.length) {
      mode = 'choice';
      message = 'Local and cloud changes overlap. Choose which copy to keep.';
      return;
    }
    if (!sameData(local, result.data) && !canReload()) {
      mode = 'deferred';
      message = 'Cloud preferences changed. Sync will finish when you leave the room.';
      return;
    }
    if (!sameData(local, result.data) && !applyData(result.data)) return;
    remember(cloud);
    mode = 'sync';
    dirty = !sameData(result.data, cloud);
    message = dirty ? 'Saving preferences to your account.' : 'Preferences are synced.';
    if (!sameData(local, result.data)) location.reload();
  }
  // Serialize identity changes and ignore completions belonging to an older session.
  async function auth(action) {
    if (busy || saving) return;
    busy = true;
    const operation = ++epoch;
    render();
    try {
      await action(operation);
    } finally {
      if (operation === epoch) {
        busy = false;
        render();
        if (dirty && mode === 'sync') timer = setTimeout(save, 500);
      }
    }
  }
  function render() {
    button.textContent = account ? 'ACCOUNT ●' : 'ACCOUNT';
    const identity = account
      ? `<p>Signed in${account.email ? ` · ${esc(account.email)}` : ''}${account.discord ? ` · Discord: ${esc(account.discord.username)}` : ''}</p><p>Solo: ${account.stats.solo.won} wins / ${account.stats.solo.played} played · Multiplayer: ${account.stats.multiplayer.won} wins / ${account.stats.multiplayer.played} played</p><button id="account-logout" class="button small subtle">SIGN OUT</button>`
      : '<p>Play as a guest, or sign in to save your preferences and view your stats.</p>';
    const conflictNames = [
      ...new Set(
        conflicts.map((path) =>
          path.startsWith('preferences.profile.name')
            ? 'display name'
            : path.startsWith('preferences.profile')
              ? 'character appearance'
              : path.startsWith('collection.loadouts')
                ? 'saved loadouts'
                : path.startsWith('collection.favorites')
                  ? 'favorites'
                  : path.startsWith('extraPreferences.roomSettings')
                    ? 'room defaults'
                    : path.startsWith('extraPreferences.displaySettings')
                      ? 'display settings'
                      : /[hH]otkeys|meleeHotkey/.test(path)
                        ? 'controls'
                        : 'preferences',
        ),
      ),
    ].join(', ');
    const choice =
      account && mode === 'choice'
        ? `<p><strong>Choose which data to keep.</strong> ${conflicts.includes('unrecognized device data') ? 'This device has existing preferences that have not been synced with this account.' : `Both devices changed your ${esc(conflictNames)}.`} Using cloud reloads this page. This choice replaces the other copy.</p><button id="account-local" class="button small primary">KEEP LOCAL & SAVE TO CLOUD</button> ${account.preferences ? '<button id="account-cloud" class="button small subtle">USE CLOUD ON THIS DEVICE</button>' : ''}`
        : '';
    const status =
      account && mode === 'sync' ? '<p>Preferences sync automatically while signed in.</p>' : '';
    const retry =
      account && mode === 'retry'
        ? '<button id="account-retry" class="button small primary">RETRY CLOUD SYNC</button>'
        : '';
    const email =
      capabilities.email && (!account || !account.email)
        ? `<form id="account-email"><label>Email <input name="email" type="email" required autocomplete="email" value="${esc(pendingEmail)}"></label><button class="button small subtle">${account ? 'LINK EMAIL' : 'SEND SIGN-IN CODE'}</button></form>${pendingEmail ? '<form id="account-code"><label>Code <input name="code" required autocomplete="one-time-code"></label><button class="button small primary">VERIFY CODE</button></form>' : ''}`
        : `<p class="helper">Email ${account?.email ? 'linked' : 'sign-in unavailable'}.</p>`;
    const discord =
      capabilities.discord && (!account || !account.discord)
        ? `<button id="account-discord" class="button small subtle">${account ? 'LINK DISCORD' : 'SIGN IN WITH DISCORD'}</button>`
        : `<p class="helper">Discord ${account?.discord ? 'linked' : 'sign-in unavailable'}.</p>`;
    dialog.innerHTML = `<div class="drawer-heading"><h2>Account</h2><button id="account-close" class="icon-button" aria-label="Close account">×</button></div>${identity}${choice}${status}${retry}<p class="helper">Cloud sync covers your profile, sound, hotkeys, loadouts, favorites, display settings and defaults for your next room.</p>${email}${discord}<p role="status" class="helper">${esc(message)}</p>`;
    const $ = (s) => dialog.querySelector(s);
    $('#account-close').onclick = () => dialog.close();
    if (saving || busy)
      dialog.querySelectorAll('button:not(#account-close), input').forEach((element) => {
        element.disabled = true;
      });
    if ($('#account-local'))
      $('#account-local').onclick = () => {
        remember();
        mode = 'sync';
        dirty = true;
        save();
        render();
      };
    if ($('#account-cloud'))
      $('#account-cloud').onclick = () => {
        if (!applyData(cloudData())) {
          render();
          return;
        }
        dirty = false;
        mode = 'sync';
        remember();
        location.reload();
      };
    if ($('#account-retry'))
      $('#account-retry').onclick = () => {
        reconcile();
        if (mode === 'sync') save();
        render();
      };
    if ($('#account-logout'))
      $('#account-logout').onclick = () =>
        auth(async () => {
          try {
            await request('logout', 'POST', {});
            clearTimeout(timer);
            account = null;
            mode = 'guest';
            dirty = false;
            pendingEmail = '';
            baseline = null;
            window.dispatchEvent(new Event('account-identity-changed'));
            message = 'Signed out.';
          } catch {
            message = 'Could not sign out. Try again.';
          }
        });
    if ($('#account-email'))
      $('#account-email').onsubmit = (event) => {
        event.preventDefault();
        const email = new FormData(event.currentTarget).get('email');
        auth(async () => {
          try {
            await request('email/start', 'POST', { email, link: !!account });
            pendingEmail = email;
            message = 'If the address can receive a code, it has been sent.';
          } catch {
            message = 'Could not send a code. Try again.';
          }
        });
      };
    if ($('#account-code'))
      $('#account-code').onsubmit = (event) => {
        event.preventDefault();
        const code = new FormData(event.currentTarget).get('code');
        auth(async () => {
          try {
            const result = await request('email/verify', 'POST', { email: pendingEmail, code });
            account = result.account;
            pendingEmail = '';
            baseline = readBaseline();
            reconcile();
            window.dispatchEvent(new Event('account-identity-changed'));
            if (mode === 'sync') message = 'Signed in. Preferences sync automatically.';
          } catch (error) {
            message =
              error.status === 409
                ? 'That identity is already linked to another account.'
                : 'Could not verify that code. Try again.';
          }
        });
      };
    if ($('#account-discord'))
      $('#account-discord').onclick = () =>
        auth(async () => {
          try {
            const result = await request('discord/start', 'POST', {
              returnOrigin: location.origin,
              link: !!account,
            });
            location.assign(result.url);
          } catch {
            message = 'Discord sign-in is unavailable. Try again.';
          }
        });
  }
  async function save() {
    clearTimeout(timer);
    if (!account || mode !== 'sync' || saving || busy || !dirty) return;
    saving = true;
    const operation = epoch,
      accountId = account.id;
    dirty = false;
    const sent = localData();
    render();
    try {
      const result = await request('preferences', 'PUT', {
        revision: account.revision,
        ...sent,
      });
      if (operation !== epoch || account?.id !== accountId) return;
      account = result.account;
      remember();
      dirty = !sameData(localData(), sent);
      message = 'Cloud save updated.';
    } catch (error) {
      if (operation !== epoch || account?.id !== accountId) return;
      dirty = true;
      if (error.status === 409 && error.data.account) {
        account = error.data.account;
        reconcile();
        if (mode === 'choice' && !dialog.open) dialog.showModal();
      } else {
        mode = 'retry';
        message =
          'Cloud save failed. Your changes are saved on this device. Retry cloud sync when connected.';
      }
    } finally {
      saving = false;
      render();
      if (dirty && mode === 'sync') timer = setTimeout(save, 500);
    }
  }
  function changed() {
    if (!applyingCloud && account && mode === 'deferred') {
      dirty = true;
      return;
    }
    if (!applyingCloud && account && ['sync', 'retry'].includes(mode)) {
      mode = 'sync';
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(save, 500);
    }
  }
  window.addEventListener('preferences-changed', changed);
  window.addEventListener('storage', (event) => {
    if (event.key === APPLYING_CLOUD) {
      applyingCloudElsewhere = event.newValue !== null;
      return;
    }
    if (applyingCloudElsewhere) return;
    if (
      [PREFERENCES_KEY, COLLECTION_KEY, ROOM_SETTINGS_KEY, PLAYER_SETTINGS_KEY].includes(
        event.key,
      ) ||
      event.key === null
    )
      changed();
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  button.onclick = () => {
    render();
    dialog.showModal();
    if (busy || saving) return;
    auth(async () => {
      try {
        const result = await request('me');
        const previous = account;
        if (previous?.id !== result.account?.id) {
          account = result.account;
          dirty = false;
          baseline = account ? readBaseline() : null;
          mode = 'guest';
          if (account) reconcile();
          window.dispatchEvent(new Event('account-identity-changed'));
        } else if (account) {
          account = result.account;
          reconcile();
        }
      } catch {
        message = 'Could not refresh account details.';
      }
    });
  };
  Promise.all([request('capabilities'), request('me')])
    .then(([caps, result]) => {
      capabilities = caps;
      busy = false;
      account = result.account;
      baseline = account ? readBaseline() : null;
      mode = 'guest';
      if (account) reconcile();
      if (dirty && mode === 'sync') timer = setTimeout(save, 500);
      render();
    })
    .catch(() => {
      busy = false;
      mode = 'guest';
      message = 'Account service unavailable. You can continue as a guest.';
      render();
    });
  return {
    changed,
    resumeSync() {
      if (mode !== 'deferred' || busy || saving || !canReload()) return;
      reconcile();
      render();
      if (dirty && mode === 'sync') timer = setTimeout(save, 500);
    },
  };
}
