import { mountMoveClip } from './move-clip.js';
import { moveBrowserUrl } from './move-clip-loader.js';

const $ = (id) => document.getElementById(id);
const EDITION = 'composed';
let moves = [],
  clip = null;

function renderList() {
  const query = $('move-search').value.trim().toLowerCase(),
    current = new URLSearchParams(location.search).get('name'),
    shown = moves.filter((move) => move.name.toLowerCase().includes(query));
  $('move-list').replaceChildren(
    ...shown.map((move) => {
      const item = document.createElement('li'),
        link = document.createElement('a');
      link.href = moveBrowserUrl(move.name);
      link.textContent = move.name;
      link.dataset.move = move.name;
      if (move.name === current) link.setAttribute('aria-current', 'page');
      item.append(link);
      return item;
    }),
  );
  $('move-list-status').textContent = moves.length
    ? shown.length
      ? `${shown.length} of ${moves.length} moves`
      : 'No moves match.'
    : 'No moves yet.';
}

function show(name, mechanicsVersion = EDITION) {
  clip?.destroy();
  clip = null;
  $('move-title').textContent = name || 'Choose a move';
  $('move-clip-note').hidden = !name;
  $('move-balance').hidden = !name;
  if (!name) return $('move-clip').replaceChildren();
  const move = moves.find((entry) => entry.name === name);
  document.title = `${name} — RANDO`;
  $('move-balance').href = `/balance.html?${new URLSearchParams({ name })}`;
  if (mechanicsVersion !== EDITION) {
    const note = document.createElement('p');
    note.className = 'helper';
    note.textContent = 'Clips are available for Composed moves only.';
    return $('move-clip').replaceChildren(note);
  }
  clip = mountMoveClip($('move-clip'), {
    name,
    mechanicsVersion,
    ...(move?.version ? { revision: move.version } : {}),
  });
}

function route() {
  const params = new URLSearchParams(location.search);
  show(params.get('name'), params.get('mechanicsVersion') || EDITION);
  renderList();
}

$('move-search').addEventListener('input', renderList);
$('move-list').addEventListener('click', (event) => {
  const link = event.target.closest('a[data-move]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
  event.preventDefault();
  history.pushState(null, '', link.href);
  route();
});
addEventListener('popstate', route);

try {
  const response = await fetch(`/api/library?mechanicsVersion=${EDITION}`);
  if (!response.ok) throw Error();
  moves = (await response.json()).moves || [];
} catch {
  $('move-list-status').textContent = 'Could not load moves. Reload to try again.';
}
route();
