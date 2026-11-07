const weekMs = 7 * 24 * 60 * 60 * 1000;
const retryMs = 5 * 60 * 1000;

// MongoDB keeps the last successful snapshot across server restarts.
export function createWeeklyCache(snapshots, { id: snapshotId, calculate, label }) {
  let snapshot;
  let initialization;
  let refreshInFlight;
  let timer;
  let stopped = false;

  function schedule(delay) {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(
      () => {
        void refresh().catch(() => {});
      },
      Math.max(1, delay),
    );
    timer.unref();
  }

  function refresh() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const summary = await calculate();
        const calculatedAt = new Date();
        const nextRefreshAt = new Date(calculatedAt.getTime() + weekMs);
        const updated = { ...summary, calculatedAt, nextRefreshAt };
        await snapshots.updateOne(
          { _id: snapshotId },
          { $set: { summary: updated } },
          { upsert: true },
        );
        snapshot = updated;
        schedule(nextRefreshAt.getTime() - Date.now());
        return snapshot;
      } catch (error) {
        console.error(`${label} refresh failed (${error.name}).`);
        // Keep serving the previous snapshot if MongoDB or aggregation fails.
        schedule(retryMs);
        throw error;
      } finally {
        refreshInFlight = undefined;
      }
    })();
    return refreshInFlight;
  }

  function start() {
    initialization ??= (async () => {
      try {
        const saved = await snapshots.findOne({ _id: snapshotId });
        snapshot = saved?.summary;
        const nextRefresh = new Date(snapshot?.nextRefreshAt).getTime();
        if (snapshot && Number.isFinite(nextRefresh) && nextRefresh > Date.now()) {
          schedule(nextRefresh - Date.now());
        } else {
          await refresh();
        }
      } catch (error) {
        // refresh() already schedules retries for aggregation/write failures.
        if (!timer) {
          console.error(`${label} cache load failed (${error.name}).`);
          schedule(retryMs);
        }
      }
    })();
    return initialization;
  }

  return {
    start,
    async get() {
      const ready = start();
      if (snapshot) return snapshot;
      await ready;
      if (snapshot) return snapshot;
      throw new Error(`${label} unavailable.`);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
