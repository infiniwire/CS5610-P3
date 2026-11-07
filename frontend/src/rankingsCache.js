const key = "paperpulse.rankings.v2";
let cached;
let pending;

function validSnapshot(saved) {
  return (
    saved?.overview &&
    Array.isArray(saved.papers) &&
    ["universities", "authors", "topics"].every(
      (type) => Array.isArray(saved[type]?.byCitations) && Array.isArray(saved[type]?.byPapers),
    ) &&
    Array.isArray(saved.universities.byMeanCitations) &&
    Number.isFinite(Date.parse(saved.nextRefreshAt))
  );
}

export function readRankings() {
  if (cached) return cached;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (validSnapshot(saved)) cached = saved;
  } catch {
    /* Disabled storage still permits the in-memory snapshot. */
  }
  return cached ?? null;
}

export function loadRankings() {
  const saved = readRankings();
  if (saved && Date.parse(saved.nextRefreshAt) > Date.now()) return Promise.resolve(saved);
  pending ??= fetch("/api/rankings?v=2")
    .then(async (response) => {
      if (!response.ok) throw new Error("Rankings are temporarily unavailable.");
      return response.json();
    })
    .then((data) => {
      if (!validSnapshot(data)) throw new Error("Rankings are temporarily unavailable.");
      cached = data;
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        /* Continue with memory. */
      }
      return data;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
