import { renderBanDraft } from '../draft-ui.js';
export function mount(root, { store, connection, ui, send }) {
  document.body.classList.remove('in-match');
  renderBanDraft({
    room: store.room,
    id: connection.id,
    root,
    headerHTML: ui.header('Move bans'),
    bindHeader: ui.bindHeader,
    send,
  });
}
export function unmount() {}
