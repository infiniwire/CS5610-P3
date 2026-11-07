const key = "paperpulse.analysis.v2";
let cached;
let pending;

function validSnapshot(saved) {
  return (
    saved?.overview &&
    Array.isArray(saved.monthly) &&
    saved.citations &&
    Array.isArray(saved.topics) &&
    Array.isArray(saved.heatmap) &&
    Array.isArray(saved.countryAnalysis?.groups) &&
    Number.isFinite(Date.parse(saved.nextRefreshAt))
  );
}

export function readAnalysis() {
  if (cached) return cached;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (validSnapshot(saved)) cached = saved;
  } catch {
    /* Storage can be disabled without disabling the page. */
  }
  return cached ?? null;
}

export function loadAnalysis() {
  const saved = readAnalysis();
  if (saved && Date.parse(saved.nextRefreshAt) > Date.now()) return Promise.resolve(saved);
  pending ??= fetch("/api/analysis?v=2")
    .then(async (response) => {
      if (!response.ok) throw new Error("Analysis is temporarily unavailable.");
      return response.json();
    })
    .then((data) => {
      if (!validSnapshot(data)) throw new Error("Analysis is temporarily unavailable.");
      cached = data;
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        /* Use memory instead. */
      }
      return data;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
