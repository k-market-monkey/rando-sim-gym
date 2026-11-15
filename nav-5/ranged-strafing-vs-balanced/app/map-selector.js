import { getSelectableMaps } from '/rando-sim-gym/nav-5/ranged-strafing-vs-balanced/shared/content/maps/catalog.js';
import { WIDTH, HEIGHT } from '/rando-sim-gym/nav-5/ranged-strafing-vs-balanced/shared/content/arena.js';
import { createMapState } from '/rando-sim-gym/nav-5/ranged-strafing-vs-balanced/shared/sim/map-state.js';
import { LEGACY_MECHANICS_VERSION, normalizeMechanicsVersion } from '/rando-sim-gym/nav-5/ranged-strafing-vs-balanced/shared/protocol/versions.js';
import { renderArena } from './renderer.js';
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function mapSelectorMarkup(
  stageId,
  disabled = false,
  mechanicsVersion = LEGACY_MECHANICS_VERSION,
  mode = 'timed',
) {
  mechanicsVersion = normalizeMechanicsVersion(mechanicsVersion);
  const maps = getSelectableMaps(mechanicsVersion),
    stage = maps.find((stage) => stage.id === stageId) || maps[0],
    index = maps.indexOf(stage);
  return `<div class="map-selector field wide" data-map-selector data-mode="${mode}" data-mechanics-version="${mechanicsVersion}"><div class="map-selector-heading"><label for="setting-stage">THE ARENA</label><span class="map-selector-number">${index + 1} / ${maps.length}</span></div><select id="setting-stage" data-setting="stage" aria-describedby="map-description" ${disabled ? 'disabled' : ''}>${maps.map((option) => `<option value="${option.id}" ${option.id === stage.id ? 'selected' : ''} ${mode === 'ctf' && !option.supportedModes?.includes('ctf') ? 'disabled' : ''}>${esc(option.name)}</option>`).join('')}</select><div class="map-selector-scene"><canvas class="map-selector-preview" width="${stage.width}" height="${stage.height}" aria-label="${esc(stage.name)} map preview"></canvas><button type="button" class="map-selector-arrow previous" data-map-step="-1" aria-label="Previous map" ${disabled ? 'disabled' : ''}>‹</button><button type="button" class="map-selector-arrow next" data-map-step="1" aria-label="Next map" ${disabled ? 'disabled' : ''}>›</button></div><p id="map-description" class="map-selector-description">${esc(stage.description)}</p><div class="map-selector-legend">${stage.legend.map((item) => `<span>${esc(item)}</span>`).join('')}</div></div>`;
}
export function bindMapSelector(container) {
  for (const widget of container.querySelectorAll('[data-map-selector]')) {
    if (widget.dataset.bound === 'true') continue;
    widget.dataset.bound = 'true';
    const mechanicsVersion = normalizeMechanicsVersion(widget.dataset.mechanicsVersion),
      maps = getSelectableMaps(mechanicsVersion);
    const select = widget.querySelector('[data-setting="stage"]'),
      canvas = widget.querySelector('canvas'),
      description = widget.querySelector('.map-selector-description'),
      number = widget.querySelector('.map-selector-number'),
      legend = widget.querySelector('.map-selector-legend');
    let previewFrame = 0;
    function paint() {
      cancelAnimationFrame(previewFrame);
      const stage = maps.find((stage) => stage.id === select.value) || maps[0];
      widget.dataset.mapId = stage.id;
      const map = createMapState(stage);
      const draw = (tick) =>
        renderArena(canvas, {
          stage: stage.id,
          mechanicsVersion,
          map,
          ...(stage.width === WIDTH ? {} : { arenaWidth: stage.width }),
          ...(stage.height === HEIGHT ? {} : { arenaHeight: stage.height }),
          preview: true,
          mode: 'timed',
          tick,
          players: [],
          entities: [],
          ring: 0,
        });
      draw(0);
      const animated =
        stage.controllers?.length ||
        stage.surfaces.some((surface) => surface.velocityX || surface.velocityY);
      if (animated && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let last = 0;
        const animate = (time) => {
          if (!widget.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          if (time - last >= 67) {
            draw(Math.floor(time * 0.03));
            last = time;
          }
          previewFrame = requestAnimationFrame(animate);
        };
        previewFrame = requestAnimationFrame(animate);
      }
      canvas.setAttribute('aria-label', `${stage.name} map preview`);
      description.textContent = stage.description;
      legend.innerHTML = stage.legend.map((item) => `<span>${esc(item)}</span>`).join('');
      number.textContent = `${maps.indexOf(stage) + 1} / ${maps.length}`;
    }
    select.addEventListener('change', paint);
    widget.querySelectorAll('[data-map-step]').forEach(
      (button) =>
        (button.onclick = () => {
          if (select.disabled) return;
          const available = maps.filter(
            (map) => widget.dataset.mode !== 'ctf' || map.supportedModes?.includes('ctf'),
          );
          if (!available.length) return;
          const index = available.findIndex((stage) => stage.id === select.value);
          select.value =
            available[
              (index + Number(button.dataset.mapStep) + available.length) % available.length
            ].id;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }),
    );
    paint();
  }
}
