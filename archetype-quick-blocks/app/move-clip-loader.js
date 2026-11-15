/** Network side of move clips: no renderer imports, so pages can prefetch. */
const WAIT_LIMIT_MS = 30000,
  loads = new Map();

/** The move browser page for one move; any screen that lists moves can link here. */
export const moveBrowserUrl = (name, mechanicsVersion = 'composed') =>
  `/move.html?${new URLSearchParams({ name, mechanicsVersion })}`;

export function moveClipUrl({ name, mechanicsVersion = 'composed', revision } = {}) {
  const query = new URLSearchParams({ name, mechanicsVersion });
  if (revision) query.set('revision', String(revision));
  return `/api/balance/clip?${query}`;
}

/** Resolve a clip, scheduling it once and polling while the server prepares it. */
export function loadMoveClip(
  selection,
  {
    fetcher = (url, init) => fetch(url, init),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    limitMs = WAIT_LIMIT_MS,
  } = {},
) {
  const url = moveClipUrl(selection);
  if (!loads.has(url)) {
    const pending = (async () => {
      let scheduled = false,
        waited = 0;
      for (;;) {
        const response = await fetcher(url, scheduled ? undefined : { method: 'POST' });
        scheduled = true;
        if (response.status === 404) throw Error('This move has no saved tests to show yet.');
        if (response.status === 429) throw Error('Too many requests. Try again shortly.');
        const body = await response.json().catch(() => ({}));
        if (body.status === 'ready' && body.clip) return body.clip;
        if (body.status !== 'pending')
          throw Error(body.message || body.error || 'This move clip is unavailable.');
        const delay = Math.max(500, (Number(body.retryAfter) || 1) * 1000);
        if ((waited += delay) > limitMs) throw Error('This clip is taking too long to prepare.');
        await wait(delay);
      }
    })();
    loads.set(url, pending);
    pending.catch(() => loads.delete(url));
  }
  return loads.get(url);
}
