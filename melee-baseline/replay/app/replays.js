import { MAP_CATALOG } from '../shared/content/maps/catalog.js';
import { settingLabels } from './room-settings-form.js';
import { replayTime } from './replay-player.js';

const $ = (id) => document.getElementById(id),
  modeNames = settingLabels('mode'),
  seen = new Set();
let nextBefore = null,
  loading = false;

function replayRow(row) {
  const item = document.createElement('li'),
    link = document.createElement('a'),
    heading = document.createElement('h2'),
    players = document.createElement('p'),
    details = document.createElement('p'),
    date = document.createElement('time'),
    watch = document.createElement('span');
  link.href = `/replay.html?id=${encodeURIComponent(row.id)}`;
  link.className = 'replay-card';
  link.dataset.replayId = row.id;
  const map = MAP_CATALOG.find((entry) => entry.id === row.map)?.name || row.map || 'Arena';
  heading.textContent = `${map} · ${modeNames[row.mode] || row.mode || 'Match'}`;
  players.className = 'replay-card-players';
  players.textContent = (row.players || []).map((player) => player.name).join(' · ');
  details.className = 'replay-card-details';
  const endedAt = new Date(row.endedAt);
  date.textContent = Number.isFinite(endedAt.getTime()) ? endedAt.toLocaleString() : 'Unknown date';
  if (Number.isFinite(endedAt.getTime())) date.dateTime = endedAt.toISOString();
  details.append(
    date,
    ` · ${replayTime(row.duration)} · ${row.region || 'This server'} · ${row.build}`,
  );
  watch.className = 'replay-card-watch';
  watch.textContent = 'Watch →';
  link.append(heading, players, details, watch);
  item.append(link);
  return item;
}

async function load(reset = false) {
  if (loading) return;
  loading = true;
  $('replays-refresh').disabled = true;
  $('replays-more').disabled = true;
  $('replays-status').textContent = 'Loading replays…';
  try {
    const query = new URLSearchParams({ limit: '30' });
    if (!reset && nextBefore) query.set('before', nextBefore);
    const response = await fetch(`/api/replays?${query}`);
    if (!response.ok) throw new Error('Replays could not be loaded. Try refreshing.');
    const result = await response.json();
    if (!Array.isArray(result.replays))
      throw new Error('Replays could not be loaded. Try refreshing.');
    if (reset) {
      $('replays-list').replaceChildren();
      seen.clear();
    }
    for (const row of result.replays) {
      if (seen.has(row.id)) continue;
      $('replays-list').append(replayRow(row));
      seen.add(row.id);
    }
    nextBefore = result.nextBefore || null;
    $('replays-more').hidden = !nextBefore;
    $('replays-status').textContent = !result.enabled
      ? 'Replays are not enabled on this server.'
      : !seen.size
        ? 'No replays yet. Finished public matches will appear here.'
        : `${seen.size} ${seen.size === 1 ? 'replay' : 'replays'}${nextBefore ? ' loaded' : ''}.`;
    if (result.replays[0]?.region)
      $('replays-region').textContent = `Server · ${result.replays[0].region}`;
  } catch (error) {
    $('replays-status').textContent = error.message;
  } finally {
    loading = false;
    $('replays-refresh').disabled = false;
    $('replays-more').disabled = false;
  }
}
$('replays-refresh').addEventListener('click', () => load(true));
$('replays-more').addEventListener('click', () => load());
load(true);
