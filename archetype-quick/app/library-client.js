import { PROGRESS_PHASES } from './move-progress.js';
import { reportCreationReady } from './creation-timing.js';

/** Catalog and generation ownership; connection context and editor effects come from the app. */
export function createLibraryClient({
  context,
  onStatusChange = () => {},
  onCatalogChange = () => {},
  onReady = () => {},
  onProgress = () => {},
  onSettled = () => {},
  reportReady = reportCreationReady,
  clock = () => performance.now(),
}) {
  let library = [],
    libraryStatus = 'loading',
    libraryRequest = 0,
    libraryFlight = null,
    generationEnabled = true;
  const pendingMoves = new Map();
  const pendingKey = (name) => context().mechanicsVersion + ':' + name;

  async function load({ afterCurrent = false } = {}) {
    const { mechanicsVersion: requested, serverId: requestedServer, origin } = context(),
      key = JSON.stringify([requestedServer, origin, requested]);
    const current = () => {
      const value = context();
      return (
        requested === value.mechanicsVersion &&
        requestedServer === value.serverId &&
        origin === value.origin
      );
    };
    if (libraryFlight?.key === key) {
      if (!afterCurrent) return libraryFlight.promise;
      // Publication may happen after an existing catalog request took its snapshot.
      // All callers waiting for that request share one fresh follow-up read.
      await libraryFlight.promise;
      if (!current()) return false;
      if (libraryFlight?.key === key) return libraryFlight.promise;
    }
    const request = ++libraryRequest,
      flight = { key, promise: null };
    libraryFlight = flight;
    libraryStatus = 'loading';
    onStatusChange();
    flight.promise = (async () => {
      try {
        const response = await fetch(
          origin + '/api/library?mechanicsVersion=' + encodeURIComponent(requested),
          { signal: AbortSignal.timeout(10000) },
        );
        if (!response.ok) throw Error();
        const data = await response.json();
        if (request !== libraryRequest || !current()) return false;
        library = data.moves || [];
        libraryStatus = 'ready';
        generationEnabled = data.generationAvailable !== false;
        onCatalogChange();
        settlePublishedMoveJobs(requested, requestedServer);
        onReady();
        return true;
      } catch {
        if (request === libraryRequest && current()) {
          libraryStatus = 'error';
          onStatusChange();
        }
        return false;
      } finally {
        if (libraryFlight === flight) libraryFlight = null;
      }
    })();
    return flight.promise;
  }

  let progressPollRunning = false;
  function moveJobIsCurrent(job) {
    const value = context();
    return (
      value.room === job.room &&
      value.playerId === job.playerId &&
      value.mechanicsVersion === job.mechanicsVersion &&
      value.serverId === job.serverId
    );
  }
  function activeMoveJob(job) {
    return !job.completed && pendingMoves.get(job.key) === job;
  }
  function settlePublishedMoveJobs(version, serverId) {
    const published = new Set(library.map((move) => move.name));
    for (const [key, job] of pendingMoves) {
      if (job.mechanicsVersion !== version || job.serverId !== serverId || !published.has(job.name))
        continue;
      // The durable library is authoritative even if this player's original POST is
      // delayed. Release its slot and connection without waiting on unrelated jobs.
      if (moveJobIsCurrent(job)) {
        const at = clock();
        try {
          reportReady(
            {
              origin: job.origin,
              token: job.token,
              room: job.room,
              playerId: job.playerId,
              mechanicsVersion: job.mechanicsVersion,
            },
            {
              name: job.name,
              jobId: job.progress.jobId || null,
              requestToCatalogMs: Math.max(0, at - job.startedAt),
              refreshMs:
                job.refreshStartedAt === null ? null : Math.max(0, at - job.refreshStartedAt),
            },
          );
        } catch {
          /* Optional observers cannot interrupt publication. */
        }
      }
      job.completed = true;
      job.published = true;
      pendingMoves.delete(key);
      job.controller.abort();
    }
  }
  async function refreshPublishedMoveJobs(jobs) {
    const active = jobs.filter(activeMoveJob);
    if (!active.length) return;
    for (const job of active) {
      job.published = true;
      job.refreshStartedAt ??= clock();
      job.progress = { ...job.progress, phase: 'refreshing' };
    }
    onProgress();
    await load({ afterCurrent: true });
    for (const job of active)
      if (activeMoveJob(job)) job.progress = { ...job.progress, phase: 'ready' };
    onProgress();
  }
  async function poll() {
    const current = context();
    if (progressPollRunning || !current.room || !current.playerId || !current.token) return;
    const entries = [...pendingMoves.entries()]
      .filter(
        ([, job]) =>
          job.room === current.room &&
          job.playerId === current.playerId &&
          job.mechanicsVersion === current.mechanicsVersion &&
          job.serverId === current.serverId &&
          job.progress.phase !== 'refreshing',
      )
      .slice(0, 5);
    if (!entries.length) return;
    progressPollRunning = true;
    try {
      const response = await fetch(current.origin + '/api/moves/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.token}` },
        body: JSON.stringify({
          names: entries.map(([, job]) => job.name),
          room: current.room,
          playerId: current.playerId,
          mechanicsVersion: current.mechanicsVersion,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return;
      const result = await response.json();
      if (result.mechanicsVersion !== current.mechanicsVersion || !Array.isArray(result.statuses))
        return;
      const published = [];
      for (const status of result.statuses) {
        const entry = entries.find(([, job]) => job.name === status.name),
          job = entry?.[1];
        if (
          !job ||
          !activeMoveJob(job) ||
          !moveJobIsCurrent(job) ||
          job.progress.phase === 'refreshing' ||
          !PROGRESS_PHASES.has(status.phase) ||
          status.phase === 'requesting' ||
          status.phase === 'refreshing'
        )
          continue;
        if (status.phase === 'ready') {
          job.progress = status;
          published.push(job);
        } else if (!job.published) job.progress = status;
      }
      if (published.length) await refreshPublishedMoveJobs(published);
      if (moveJobIsCurrent(current)) onProgress();
    } catch {
      /* Progress polling never interrupts the generation request. */
    } finally {
      progressPollRunning = false;
    }
  }
  async function generate(name, { onError = () => {} } = {}) {
    const {
        room: requestRoom,
        playerId: requestPlayer,
        mechanicsVersion: requestEdition,
        serverId: requestServer,
        origin: requestOrigin,
        token,
      } = context(),
      key = pendingKey(name);
    const job = {
      key,
      name,
      room: requestRoom,
      playerId: requestPlayer,
      mechanicsVersion: requestEdition,
      serverId: requestServer,
      origin: requestOrigin,
      token,
      startedAt: clock(),
      refreshStartedAt: null,
      controller: new AbortController(),
      completed: false,
      published: false,
      progress: { phase: 'requesting', attempt: 0 },
    };
    pendingMoves.set(key, job);
    onProgress();
    try {
      const response = await fetch(requestOrigin + '/api/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name,
          room: requestRoom,
          playerId: requestPlayer,
          mechanicsVersion: requestEdition,
        }),
        signal: job.controller.signal,
      });
      const data = await response.json();
      if (!activeMoveJob(job)) return;
      if (!response.ok)
        throw Error(
          data.error || data.message || 'Move generation is unavailable. Click retry to try again.',
        );
      job.published = true;
      const current = context();
      if (requestEdition !== current.mechanicsVersion || requestServer !== current.serverId) return;
      await refreshPublishedMoveJobs([job]);
    } catch (error) {
      if (activeMoveJob(job) && !job.published && moveJobIsCurrent(job)) onError(error.message);
    } finally {
      // A published move whose catalog read failed stays pollable; do not restart
      // generation or turn a late POST error into a failure for an accepted move.
      if (pendingMoves.get(key) === job && (!job.published || !moveJobIsCurrent(job)))
        pendingMoves.delete(key);
      onSettled();
    }
  }

  return {
    load,
    generate,
    poll,
    reset() {
      library = [];
      libraryStatus = 'loading';
    },
    snapshot() {
      return { moves: [...library], status: libraryStatus, generationEnabled };
    },
    pending(name) {
      const job = pendingMoves.get(pendingKey(name));
      return job ? { name: job.name, progress: { ...job.progress } } : undefined;
    },
    get pendingCount() {
      return pendingMoves.size;
    },
  };
}
