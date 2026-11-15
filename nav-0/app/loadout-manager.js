import { MECHANICS_VERSIONS } from '../shared/protocol/versions.js';
import { hotkeyLabel } from './preferences.js';
import { bindSavedHotkeys } from './saved-hotkey-capture.js';
import {
  readCollection,
  writeCollection,
  saveNamedLoadout,
  deleteNamedLoadout,
  validateLoadout,
  resolveLoadout,
  sharedLoadoutURL,
  readSharedLoadout,
} from './loadout-collection.js';
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const versionLabel = (id) => MECHANICS_VERSIONS.find((version) => version.id === id)?.label || id;

// The manager edits its own form. Only the explicit review/apply action crosses
// into the active next-round draft. No editor or import path creates a move.
export function createLoadoutManager(adapter) {
  const dialog = document.createElement('dialog');
  dialog.id = 'loadout-manager';
  dialog.className = 'loadout-manager';
  dialog.setAttribute('aria-labelledby', 'loadout-manager-title');
  document.body.append(dialog);
  let collection = readCollection(),
    version,
    editingId,
    review = null,
    reviewFromShare = false,
    useKeys = false,
    reviewSignature = '',
    shareSeen = '',
    shareURL = '',
    keyCapture,
    editorHotkeys = [],
    editorBaseline = '',
    reviewReturn = null,
    reviewDirty = false,
    storageUnavailable = false;
  const context = () => adapter.context(),
    $ = (selector) => dialog.querySelector(selector);
  const reloadCollection = () => {
    if (storageUnavailable) return;
    try {
      globalThis.localStorage.getItem('rando.loadout-collection.v1');
      collection = readCollection();
    } catch {}
  };
  const persist = () => {
    const saved = writeCollection(collection);
    storageUnavailable = !saved;
    adapter.changed?.(collection);
    return saved;
  };
  const notice = (text) => {
    const target = $('#loadout-manager-status');
    if (target) target.textContent = text;
  };
  function shell(title, body) {
    keyCapture?.destroy();
    keyCapture = null;
    dialog.innerHTML = `<div class="drawer-heading"><h2 id="loadout-manager-title">${esc(title)}</h2><button type="button" class="icon-button" id="loadout-manager-close" aria-label="Close saved loadouts">×</button></div>${body}<p id="loadout-manager-status" class="helper" role="status"></p>`;
    $('#loadout-manager-close').onclick = close;
  }
  function show() {
    adapter.beforeOpen?.();
    adapter.guard(() => {
      if (!dialog.open) dialog.showModal();
    });
  }
  function clearShare() {
    if (reviewFromShare) {
      const url = new URL(location.href);
      if (url.hash.startsWith('#loadout=')) {
        url.hash = '';
        history.replaceState(null, '', url);
      }
      reviewFromShare = false;
    }
  }
  function close() {
    if ($('#saved-loadout-form') && editorDirty()) {
      confirmDiscard(forceClose);
      return;
    }
    if (review && reviewDirty) {
      confirmDiscard(forceClose, reviewReturn);
      return;
    }
    forceClose();
  }
  function forceClose() {
    clearShare();
    review = null;
    reviewDirty = false;
    keyCapture?.destroy();
    keyCapture = null;
    dialog.close();
    adapter.afterClose?.();
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  function formValues() {
    return validateLoadout({
      mechanicsVersion: version,
      name: $('#saved-loadout-name').value,
      moves: Array.from({ length: 5 }, (_, slot) => $('#saved-move-' + slot).value),
      ...($('#saved-include-keys').checked ? { hotkeys: editorHotkeys } : {}),
    });
  }
  function editorState() {
    return {
      name: $('#saved-loadout-name').value,
      moves: Array.from({ length: 5 }, (_, slot) => $('#saved-move-' + slot).value),
      hotkeys: [...editorHotkeys],
      includeKeys: $('#saved-include-keys').checked,
    };
  }
  function editorDirty() {
    return JSON.stringify(editorState()) !== editorBaseline;
  }
  function confirmDiscard(action, cancel) {
    const target = $('#saved-discard');
    target.hidden = false;
    target.innerHTML =
      '<p>Discard unsaved changes?</p><button type="button" class="button small subtle" id="saved-discard-confirm">DISCARD</button> <button type="button" class="button small subtle" id="saved-discard-cancel">KEEP EDITING</button>';
    $('#saved-discard-confirm').onclick = action;
    $('#saved-discard-cancel').onclick = () => {
      if (cancel) cancel();
      else target.hidden = true;
    };
    $('#saved-discard-confirm').focus();
  }
  function leaveEditor(action) {
    if (editorDirty()) confirmDiscard(action);
    else action();
  }
  async function share(item) {
    try {
      shareURL = sharedLoadoutURL(item, location.href, context().serverId);
      $('#saved-share-output').innerHTML =
        '<label class="field" for="saved-share-link">Share this loadout<input id="saved-share-link" readonly></label><p class="helper">Includes move names, ruleset and optional hotkeys.</p>';
      $('#saved-share-link').value = shareURL;
      $('#saved-share-link').select();
      try {
        await navigator.clipboard.writeText(shareURL);
        notice('Share link copied.');
      } catch {
        notice('Copy the selected link to share.');
      }
    } catch (error) {
      notice(error.message);
    }
  }
  function renderList() {
    review = null;
    reviewReturn = null;
    reviewDirty = false;
    const ctx = context();
    shell(
      'Saved loadouts',
      `<label class="field saved-ruleset" for="saved-loadout-version">Ruleset<select id="saved-loadout-version">${MECHANICS_VERSIONS.map((v) => `<option value="${v.id}" ${version === v.id ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label><button type="button" class="button small subtle" id="saved-loadout-new">+ NEW FROM ${version === ctx.version ? 'YOUR DRAFT' : 'EMPTY SLOTS'}</button><div class="saved-loadout-list">${(collection.loadouts[version] || []).map((item) => `<article class="saved-loadout-card"><h3>${esc(item.name)}</h3><ol>${item.moves.map((name) => `<li>${esc(name || 'Empty slot')}</li>`).join('')}</ol><div class="saved-loadout-actions"><button type="button" class="button small primary" aria-label="Use ${esc(item.name)}" data-use-loadout="${esc(item.id)}">USE</button><button type="button" class="button small subtle" aria-label="Edit ${esc(item.name)}" data-edit-loadout="${esc(item.id)}">EDIT</button><button type="button" class="button small subtle" aria-label="Share ${esc(item.name)}" data-share-loadout="${esc(item.id)}">SHARE</button></div></article>`).join('') || '<p class="helper">No saved loadouts in this ruleset yet.</p>'}</div><div id="saved-share-output"></div>`,
    );
    $('#saved-loadout-version').onchange = (event) => {
      version = event.target.value;
      renderList();
    };
    $('#saved-loadout-new').onclick = () => renderEditor();
    for (const button of dialog.querySelectorAll(
      '[data-edit-loadout], [data-use-loadout], [data-share-loadout]',
    )) {
      button.onclick = () => {
        const id =
          button.dataset.editLoadout || button.dataset.useLoadout || button.dataset.shareLoadout;
        const item = collection.loadouts[version].find((entry) => entry.id === id);
        if (button.dataset.editLoadout) renderEditor(item);
        else if (button.dataset.useLoadout) {
          review = item;
          useKeys = false;
          reviewReturn = renderList;
          renderReview();
        } else share(item);
      };
    }
  }
  function renderEditor(item, restoredBaseline) {
    review = null;
    reviewSignature = '';
    shareURL = '';
    const ctx = context();
    version = item?.mechanicsVersion || version || ctx.version;
    editingId = item?.id;
    const draft = item || {
      name: '',
      moves: version === ctx.version ? ctx.moves : Array(5).fill(''),
      hotkeys: ctx.hotkeys,
    };
    editorHotkeys = Array.from({ length: 5 }, (_, slot) => draft.hotkeys?.[slot] || '');
    shell(
      editingId ? 'Edit loadout' : 'New loadout',
      `<button type="button" class="button small subtle" id="saved-loadout-back">BACK TO LOADOUTS</button><p class="helper">${esc(versionLabel(version))} ruleset</p><div id="saved-discard" class="saved-confirm" hidden></div><form id="saved-loadout-form"><label class="field" for="saved-loadout-name">Loadout name<input id="saved-loadout-name" maxlength="40" required value="${esc(draft.name)}" placeholder="Name this loadout"></label><div class="saved-move-list">${Array.from({ length: 5 }, (_, slot) => `<div class="saved-move-row"><label for="saved-move-${slot}">Move ${slot + 1}</label><input id="saved-move-${slot}" maxlength="14" list="saved-library-names" value="${esc(draft.moves[slot] || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"><label class="sr-only" for="saved-key-${slot}">Hotkey for saved move ${slot + 1}</label><button type="button" class="hotkey-button" id="saved-key-${slot}" data-saved-hotkey="${slot}" aria-describedby="saved-key-help">${esc(hotkeyLabel(editorHotkeys[slot]))}</button></div>`).join('')}</div><datalist id="saved-library-names">${(version === ctx.version ? ctx.library : []).map((move) => `<option value="${esc(move.name)}"></option>`).join('')}</datalist><p id="saved-key-help" class="helper" role="status"></p><label class="saved-check"><input type="checkbox" id="saved-include-keys" ${(draft.includeKeys ?? !!draft.hotkeys) ? 'checked' : ''}> Save these extra hotkeys with this loadout</label><p class="helper">Exact move names, up to five slots. Editing here won’t generate moves or change your current draft.</p><div class="saved-loadout-actions"><button class="button small primary" type="submit">${editingId ? 'SAVE CHANGES' : 'SAVE LOADOUT'}</button>${editingId ? '<button type="button" class="button small subtle" id="saved-loadout-copy">SAVE AS NEW</button>' : ''}<button type="button" class="button small subtle" id="saved-loadout-review">REVIEW & USE</button><button type="button" class="button small subtle" id="saved-loadout-share">SHARE LINK</button>${editingId ? '<button type="button" class="button small subtle" id="saved-loadout-delete">DELETE</button><span id="saved-delete-confirm" hidden><span>Delete this loadout?</span> <button type="button" class="button small subtle" id="saved-delete-yes">DELETE</button> <button type="button" class="button small subtle" id="saved-delete-no">CANCEL</button></span>' : ''}</div></form><div id="saved-share-output"></div>`,
    );
    keyCapture = bindSavedHotkeys(dialog, {
      getKeys: () => editorHotkeys,
      onChange: (keys) => {
        editorHotkeys = keys;
        $('#saved-include-keys').checked = true;
      },
      notify: notice,
    });
    editorBaseline = restoredBaseline || JSON.stringify(editorState());
    $('#saved-loadout-back').onclick = () => leaveEditor(renderList);
    function save(asNew = false) {
      try {
        const values = formValues();
        reloadCollection();
        const record = saveNamedLoadout(collection, values, asNew ? undefined : editingId),
          stored = persist();
        renderEditor(record);
        notice(
          stored
            ? 'Loadout saved on this browser.'
            : 'Saved for this session. Browser storage is unavailable; copy a share link to keep it.',
        );
      } catch (error) {
        notice(error.message);
      }
    }
    $('#saved-loadout-form').onsubmit = (event) => {
      event.preventDefault();
      save();
    };
    $('#saved-loadout-copy')?.addEventListener('click', () => save(true));
    $('#saved-loadout-delete')?.addEventListener('click', () => {
      $('#saved-delete-confirm').hidden = false;
      $('#saved-delete-yes').focus();
    });
    $('#saved-delete-no')?.addEventListener('click', () => {
      $('#saved-delete-confirm').hidden = true;
      $('#saved-loadout-delete').focus();
    });
    $('#saved-delete-yes')?.addEventListener('click', () => {
      reloadCollection();
      deleteNamedLoadout(collection, version, editingId);
      persist();
      renderList();
      notice('Loadout deleted.');
    });
    $('#saved-loadout-review').onclick = () => {
      try {
        review = formValues();
        reviewDirty = editorDirty();
        const state = editorState(),
          baseline = editorBaseline,
          id = editingId;
        reviewReturn = () =>
          renderEditor({ ...state, mechanicsVersion: version, ...(id ? { id } : {}) }, baseline);
        useKeys = false;
        renderReview();
      } catch (error) {
        notice(error.message);
      }
    };
    $('#saved-loadout-share').onclick = () => {
      try {
        share(formValues());
      } catch (error) {
        notice(error.message);
      }
    };
  }
  function renderReview() {
    const ctx = context(),
      same = ctx.version === review.mechanicsVersion,
      available = same && ctx.libraryStatus === 'ready',
      resolved = resolveLoadout(review, available ? ctx.library : [], ctx.count),
      hasRoom = !!ctx.room;
    reviewSignature = JSON.stringify([
      ctx.room,
      ctx.version,
      ctx.count,
      ctx.libraryStatus,
      ctx.library.map((move) => move.name),
    ]);
    shell(
      reviewFromShare ? 'Import shared loadout' : 'Use saved loadout',
      `<div id="saved-discard" class="saved-confirm" hidden></div><div class="loadout-review"><h3>${esc(review.name)}</h3><p class="helper">${esc(versionLabel(review.mechanicsVersion))} ruleset</p><ol class="review-moves">${review.moves.map((name, slot) => `<li ${name && available && resolved.missing.some((item) => item.slot === slot) ? 'class="missing"' : ''}>${esc(name || 'Empty slot')}${name && available && resolved.missing.some((item) => item.slot === slot) ? ' — unavailable here; slot will stay empty' : ''}${hasRoom && slot >= ctx.count ? ' · saved for rooms with more slots' : ''}</li>`).join('')}</ol>${review.hotkeys ? `<label class="saved-check"><input id="import-hotkeys" type="checkbox" ${useKeys ? 'checked' : ''}> Also replace my extra hotkeys</label><p class="helper">${review.hotkeys.map((key, slot) => `${slot + 1}: ${esc(hotkeyLabel(key))}`).join(' · ')}</p>` : '<p class="helper">Your extra hotkeys will stay unchanged.</p>'}<p id="loadout-review-help" class="helper">${!hasRoom ? 'Save a copy, then use it when you join a room.' : !same ? 'This room uses a different ruleset. Save a copy to use later; room rules will stay unchanged.' : !available ? 'Wait for the move library, or retry it, before applying.' : resolved.missing.length ? 'Unavailable moves become empty slots. Choose replacements from the library; nothing will be generated.' : 'Applying replaces your next-round draft. Your current round and profile stay unchanged.'}</p><div class="saved-loadout-actions">${hasRoom && same && ctx.libraryStatus === 'error' ? '<button type="button" id="import-retry-library" class="button small subtle">RETRY LIBRARY</button>' : ''}<button type="button" id="import-save" class="button small subtle">SAVE A COPY</button><button type="button" id="import-apply" class="button small primary" ${hasRoom && available ? '' : 'disabled'}>APPLY TO NEXT ROUND</button><button type="button" id="import-back" class="button small subtle">${reviewFromShare ? 'CANCEL' : 'BACK'}</button></div></div>`,
    );
    $('#import-retry-library')?.addEventListener('click', () => adapter.retryLibrary?.());
    $('#import-hotkeys')?.addEventListener('change', (event) => (useKeys = event.target.checked));
    $('#import-save').onclick = () => {
      try {
        reloadCollection();
        saveNamedLoadout(collection, review);
        const stored = persist();
        notice(
          stored
            ? 'A copy was saved. Your draft is unchanged.'
            : 'Saved for this session only; browser storage is unavailable.',
        );
        $('#import-save').disabled = true;
      } catch (error) {
        notice(error.message);
      }
    };
    const applyReview = () => {
      const latest = context();
      if (
        !latest.room ||
        latest.version !== review.mechanicsVersion ||
        latest.libraryStatus !== 'ready'
      ) {
        renderReview();
        return;
      }
      const resolved = resolveLoadout(review, latest.library, latest.count);
      adapter.apply(resolved.moves, useKeys ? review.hotkeys : null);
      forceClose();
      adapter.notify(
        resolved.missing.length
          ? 'Loadout applied. Choose library replacements for the empty slots.'
          : 'Loadout applied to your next round.',
      );
    };
    $('#import-apply').onclick = () => {
      if (reviewDirty) confirmDiscard(applyReview, reviewReturn);
      else applyReview();
    };
    $('#import-back').onclick = () => {
      if (reviewFromShare) close();
      else reviewReturn?.();
    };
  }
  return {
    get collection() {
      return collection;
    },
    open() {
      reviewFromShare = false;
      version = context().version;
      reloadCollection();
      renderList();
      show();
    },
    refresh() {
      if (dialog.open && review) {
        const ctx = context(),
          signature = JSON.stringify([
            ctx.room,
            ctx.version,
            ctx.count,
            ctx.libraryStatus,
            ctx.library.map((move) => move.name),
          ]);
        if (signature !== reviewSignature) renderReview();
      }
    },
    readShare() {
      const url = location.href,
        shared = readSharedLoadout(url);
      if (!shared || shareSeen === new URL(url).hash) return;
      shareSeen = new URL(url).hash;
      reviewFromShare = true;
      reviewDirty = false;
      reloadCollection();
      if (shared.error) {
        review = null;
        shell('Cannot import loadout', `<p role="alert">${esc(shared.error)}</p>`);
      } else {
        review = shared.loadout;
        useKeys = false;
        renderReview();
      }
      show();
    },
    close,
  };
}
