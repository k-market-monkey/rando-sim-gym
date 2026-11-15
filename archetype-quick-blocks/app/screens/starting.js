import { MAP_CATALOG } from '../../shared/content/maps/catalog.js';
import { MECHANICS_VERSIONS } from '../../shared/protocol/versions.js';
import { drawAvatar } from '../renderer.js';
import { renderRoundCountdown, stopRoundCountdown } from '../countdown-ui.js';
export function mount(root, { store, connection, ui, modeNames }) {
  document.body.classList.remove('in-match');
  const settings = store.room.roundSettings;
  renderRoundCountdown({
    root,
    room: store.room,
    id: connection.id,
    headerHTML: ui.header('Round preview'),
    bindHeader: ui.bindHeader,
    drawAvatar,
    summary: [
      MAP_CATALOG.find((map) => map.id === settings.stage)?.name,
      modeNames[settings.mode],
      MECHANICS_VERSIONS.find((version) => version.id === settings.mechanicsVersion)?.label,
    ]
      .filter(Boolean)
      .join(' · '),
  });
}
export function unmount() {
  stopRoundCountdown();
}
