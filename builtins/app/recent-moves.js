// The newest generated moves, listed on the home screen. The server caches the
// list for a minute; this module keeps its own copy for as long, so re-rendering
// the home screen does not refetch it.
import { useStylesheet } from './use-stylesheet.js';
import { moveBrowserUrl } from './move-clip-loader.js';

export const RECENT_MOVES_TTL_MS = 60_000;
const RETRY_MS = 10_000;
const EDITIONS = { classic: 'CLASSIC', composed: 'COMPOSED' };
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

let cached = null,
  nextFetch = 0,
  pending = null;

/** Draws an 8×8 glyph at 2 px per cell; digit n uses colors[n - 1]. */
export function drawGlyph(canvas, glyph, colors) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!glyph) {
    ctx.fillStyle = colors[0];
    ctx.fillRect(4, 4, 8, 8);
    return;
  }
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const n = Number(glyph[y][x]);
      if (!n) continue;
      ctx.fillStyle = colors[n - 1];
      ctx.fillRect(x * 2, y * 2, 2, 2);
    }
}

function render(section, moves) {
  section.hidden = !moves.length;
  section.innerHTML = `<h2>RECENT MOVES</h2><ol class="recent-moves-list">${moves
    .map(
      (move) =>
        `<li class="recent-move" data-recent-move="${esc(move.name)}" title="Created ${esc(new Date(move.createdAt).toLocaleString())}"><canvas width="16" height="16" aria-hidden="true"></canvas><a class="recent-move-name" href="${esc(moveBrowserUrl(move.name, move.mechanicsVersion))}">${esc(move.name)}</a><span class="tag">${esc(EDITIONS[move.mechanicsVersion] || move.mechanicsVersion)}</span></li>`,
    )
    .join('')}</ol>`;
  section
    .querySelectorAll('canvas')
    .forEach((canvas, i) => drawGlyph(canvas, moves[i].glyph, moves[i].colors));
}

function load() {
  pending ||= fetch('/api/moves/recent')
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((body) => {
      cached = Array.isArray(body.moves) ? body.moves : [];
      nextFetch = Date.now() + RECENT_MOVES_TTL_MS;
    })
    .catch(() => {
      // Keep any list already shown; try again shortly.
      nextFetch = Date.now() + RETRY_MS;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Appends the list to `container` (the home screen); hidden while it is empty. */
export function mountRecentMoves(container) {
  useStylesheet('/recent-moves.css');
  const section = document.createElement('section');
  section.className = 'recent-moves';
  section.setAttribute('aria-label', 'Recent moves');
  section.hidden = true;
  container.append(section);
  if (cached) render(section, cached);
  if (Date.now() >= nextFetch)
    load().then(() => {
      if (section.isConnected && cached) render(section, cached);
    });
  return section;
}
