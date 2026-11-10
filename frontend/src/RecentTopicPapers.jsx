import { useEffect, useState } from "react";
import { useReader } from "./ReaderContext.js";
import PaperList from "./PaperList.jsx";
import { topicRequest } from "./topicRequest.js";
import "./RecentTopicPapers.css";

export default function RecentTopicPapers({ followedTopics }) {
  const { sessionExpired } = useReader();
  const [topic, setTopic] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${topic}:${page}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      ...(topic ? { topicId: topic } : {}),
    });
    topicRequest(`followed-topics/papers?${params}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: error.message });
        if (error.status === 401) sessionExpired();
      });
    return () => controller.abort();
  }, [topic, page, key, sessionExpired]);
  const current = result?.key === key ? result : null;
  return (
    <section className="recent-topic-papers" aria-labelledby="recent-topics-heading">
      <h2 id="recent-topics-heading">3. Recent papers</h2>
      <label>
        Followed topic
        <select
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All followed topics</option>
          {followedTopics.map((item) => (
            <option key={item.topicId} value={item.topicId}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Newest publication date first. “Last checked” records when you marked a topic as checked; it
        is not a publication date or a first-import time.
      </p>
      <div aria-busy={!current}>
        {!current && <p role="status">Loading recent papers…</p>}
        {current?.error && (
          <p role="alert">
            {current.error}{" "}
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Retry papers
            </button>
          </p>
        )}
        {current?.data &&
          (current.data.papers.length ? (
            <PaperList papers={current.data.papers} start={(page - 1) * 20 + 1} />
          ) : (
            <p role="status">No papers are available for these followed topics.</p>
          ))}
      </div>
      <nav className="paper-pagination" aria-label="Recent paper pages">
        <button
          type="button"
          disabled={!current || page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </button>
        <span aria-live="polite">Page {page}</span>
        <button
          type="button"
          disabled={!current?.data?.hasNext}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
