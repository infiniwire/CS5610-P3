import { useEffect, useState } from "react";
import AuthPanel from "./AuthPanel.jsx";
import PaperList from "./PaperList.jsx";
import "./App.css";

const initialQuery = {
  institution: "",
  month: "",
  sort: "citations_desc",
  page: 1,
};

async function fetchJson(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`Request failed (HTTP ${response.status}).`);
  return response.json();
}

export default function App() {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState(null);
  const [universities, setUniversities] = useState([]);
  const [universityError, setUniversityError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson("/api/papers/institutions", controller.signal)
      .then(({ institutions }) => setUniversities(institutions))
      .catch(() => {
        if (!controller.signal.aborted) setUniversityError(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      sort: query.sort,
      page: String(query.page),
    });
    if (query.institution) params.set("institution", query.institution);
    if (query.month) params.set("month", query.month);

    fetchJson(`/api/papers?${params}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ query, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ query, error: true });
      });
    return () => controller.abort();
  }, [query]);

  const current = result?.query === query ? result : null;
  const data = current?.data;
  const loading = current === null;

  function changeFilter(event) {
    const { name, value } = event.target;
    setQuery((previous) => ({ ...previous, [name]: value, page: 1 }));
  }

  function changePage(offset) {
    setQuery((previous) => ({ ...previous, page: previous.page + offset }));
  }

  return (
    <main className="paper-browser">
      <header className="browser-header">
        <h1>PaperPulse</h1>
        <p>Browse 2026 research from universities in the United States and Canada.</p>
      </header>

      <AuthPanel />

      <fieldset className="paper-filters">
        <legend>Filter papers</legend>
        <label>
          University
          <select
            name="institution"
            value={query.institution}
            onChange={changeFilter}
            disabled={universities.length === 0}
          >
            <option value="">
              {universityError
                ? "Universities unavailable"
                : universities.length ? "All universities" : "Loading universities…"}
            </option>
            {universities.map(({ id, name, country }) => (
              <option key={id} value={id}>{name} ({country})</option>
            ))}
          </select>
        </label>
        <label>
          Publication month
          <input
            type="month"
            name="month"
            value={query.month}
            onChange={changeFilter}
            placeholder="YYYY-MM"
          />
        </label>
        <label>
          Sort by citations
          <select name="sort" value={query.sort} onChange={changeFilter}>
            <option value="citations_desc">Most cited</option>
            <option value="citations_asc">Least cited</option>
          </select>
        </label>
        <button type="button" onClick={() => setQuery(initialQuery)}>Reset</button>
      </fieldset>

      <section aria-label="Paper results" aria-busy={loading}>
        {loading && <p role="status">Loading papers…</p>}
        {current?.error && (
          <p role="alert">
            Could not load papers.{" "}
            <button type="button" onClick={() => setQuery({ ...query })}>Retry</button>
          </p>
        )}
        {data?.papers.length === 0 && <p role="status">No papers match these filters.</p>}
        {data?.papers.length > 0 && (
          <PaperList papers={data.papers} start={(data.page - 1) * data.pageSize + 1} />
        )}
      </section>

      <nav className="paper-pagination" aria-label="Paper pages">
        <button type="button" onClick={() => changePage(-1)} disabled={loading || query.page === 1}>
          Previous
        </button>
        <span aria-live="polite">Page {query.page}</span>
        <button type="button" onClick={() => changePage(1)} disabled={!data?.hasNext}>
          Next
        </button>
      </nav>
    </main>
  );
}
