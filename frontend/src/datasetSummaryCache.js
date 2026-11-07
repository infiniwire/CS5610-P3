const storageKey = "paperpulse.dataset-summary.v1";
let cached;
let pending;

export function readDatasetSummary() {
  if (cached) return cached;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (
      saved &&
      Number.isFinite(saved.total) &&
      Array.isArray(saved.types) &&
      saved.affiliations &&
      Number.isFinite(Date.parse(saved.nextRefreshAt))
    ) {
      cached = saved;
    }
  } catch {
    // Private browsing or disabled storage still allows the in-memory cache.
  }
  return cached ?? null;
}

export function loadDatasetSummary() {
  const saved = readDatasetSummary();
  if (saved && Date.parse(saved.nextRefreshAt) > Date.now()) return Promise.resolve(saved);
  pending ??= fetch("/api/papers/summary")
    .then((response) => {
      if (!response.ok) throw new Error("Dataset summary unavailable.");
      return response.json();
    })
    .then((data) => {
      cached = data;
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        // The current page can still use the fetched summary.
      }
      return data;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
