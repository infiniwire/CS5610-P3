import { useEffect, useState } from "react";
import PaperList from "./PaperList.jsx";
import UniversityFilter from "./UniversityFilter.jsx";

const initialQuery = {
  subject: "",
  author: "",
  topic: "",
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

export default function PaperIndex() {
  const [query, setQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const institution = params.get("institution") ?? "";
    const month = params.get("month") ?? "";

    return {
      ...initialQuery,
      subject: (params.get("subject") ?? "").slice(0, 120),
      author: (params.get("author") ?? "").slice(0, 120),
      topic: (params.get("topic") ?? "").slice(0, 120),
      institution: /^I[1-9]\d*$/.test(institution) ? `https://openalex.org/${institution}` : "",
      month: /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) ? month : "",
    };
  });
  const [search, setSearch] = useState(() => ({
    subject: query.subject,
    author: query.author,
    topic: query.topic,
  }));
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
    for (const key of ["subject", "author", "topic"]) {
      if (query[key]) params.set(key, query[key]);
    }

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

  function submitSearch(event) {
    event.preventDefault();
    setQuery((previous) => ({
      ...previous,
      subject: search.subject.trim(),
      author: search.author.trim(),
      topic: search.topic.trim(),
      page: 1,
    }));
  }

  function resetFilters() {
    setSearch({ subject: "", author: "", topic: "" });
    setQuery(initialQuery);
  }

  return (
    <section className="research-index" id="papers" aria-labelledby="papers-heading">
      <div className="index-heading">
        <h1 id="papers-heading">Research index</h1>
        <p>
          Data from <a href="https://openalex.org/">OpenAlex</a>
        </p>
      </div>
      <form
        className="paper-search"
        onSubmit={submitSearch}
        role="search"
        aria-label="Search papers"
      >
        <div className="paper-search-fields">
          <label>
            Subject (title)
            <input
              type="search"
              name="subject"
              maxLength={120}
              placeholder="e.g. large language models"
              value={search.subject}
              onChange={(event) =>
                setSearch((previous) => ({ ...previous, subject: event.target.value }))
              }
              aria-describedby="paper-search-hint"
            />
          </label>
          <label>
            Author
            <input
              type="search"
              name="author"
              maxLength={120}
              placeholder="e.g. Wayne Xin Zhao"
              value={search.author}
              onChange={(event) =>
                setSearch((previous) => ({ ...previous, author: event.target.value }))
              }
              aria-describedby="paper-search-hint"
            />
          </label>
          <label>
            Topics
            <input
              type="search"
              name="topic"
              maxLength={120}
              placeholder="e.g. natural language processing"
              value={search.topic}
              onChange={(event) =>
                setSearch((previous) => ({ ...previous, topic: event.target.value }))
              }
              aria-describedby="paper-search-hint"
            />
          </label>
          <button type="submit">Search</button>
        </div>
        <p id="paper-search-hint">
          Search titles, author names, and research topics. Filled fields are combined.
        </p>
      </form>
      <fieldset className="paper-filters">
        <legend>Filter papers</legend>
        <UniversityFilter
          universities={universities}
          value={query.institution}
          failed={universityError}
          onChange={(institution) =>
            setQuery((previous) => ({ ...previous, institution, page: 1 }))
          }
        />
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
        <button type="button" onClick={resetFilters}>
          Reset
        </button>
      </fieldset>

      <section aria-label="Paper results" aria-busy={loading}>
        {loading && <p role="status">Loading papers…</p>}
        {current?.error && (
          <p role="alert">
            Could not load papers.{" "}
            <button type="button" onClick={() => setQuery({ ...query })}>
              Retry
            </button>
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
    </section>
  );
}
