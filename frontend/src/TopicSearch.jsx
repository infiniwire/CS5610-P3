import { useEffect, useState } from "react";
import { useReader } from "./ReaderContext.js";
import { topicRequest } from "./topicRequest.js";
import "./TopicSearch.css";

export default function TopicSearch({ followedTopics, onFollow }) {
  const { sessionExpired } = useReader();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const key = `${query}:${page}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    topicRequest(`topics?${new URLSearchParams({ q: query, page: String(page) })}`, {
      signal: controller.signal,
      personal: false,
    })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [query, page, key]);
  async function follow(id) {
    setPending(id);
    setError("");
    try {
      const { followedTopic } = await topicRequest("followed-topics", {
        method: "POST",
        body: { topicId: id },
      });
      onFollow(followedTopic);
    } catch (error) {
      setError(error.message);
      if (error.status === 401) sessionExpired();
    } finally {
      setPending("");
    }
  }
  const current = result?.key === key ? result : null;
  return (
    <section className="topic-search" aria-labelledby="topic-search-heading">
      <h2 id="topic-search-heading">1. Find primary research topics</h2>
      <form
        role="search"
        aria-label="Search primary topics"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft.trim());
          setPage(1);
          setAttempt((value) => value + 1);
        }}
      >
        <label>
          Topic name or OpenAlex Topic ID
          <input
            type="search"
            maxLength={120}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. machine learning"
          />
        </label>
        <button type="submit">Search topics</button>
      </form>
      {!current && <p role="status">Loading topics…</p>}
      {current?.error && (
        <p role="alert">
          {current.error}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry topics
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {current?.data && (
        <>
          {!current.data.topics.length && <p role="status">No primary topics match your search.</p>}
          <ul className="topic-search-results">
            {current.data.topics.map((topic) => {
              const saved = followedTopics.some((item) => item.topicId === topic.id);
              return (
                <li key={topic.id}>
                  <span>
                    {topic.name}{" "}
                    <small>
                      ({topic.id.split("/").at(-1)} · {topic.count.toLocaleString("en")} papers)
                    </small>
                  </span>
                  <button
                    type="button"
                    disabled={saved || Boolean(pending)}
                    onClick={() => void follow(topic.id)}
                  >
                    {saved ? "Following" : pending === topic.id ? "Following…" : "Follow"}
                  </button>
                </li>
              );
            })}
          </ul>
          <nav className="paper-pagination" aria-label="Topic search pages">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              disabled={!current.data.hasNext}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
