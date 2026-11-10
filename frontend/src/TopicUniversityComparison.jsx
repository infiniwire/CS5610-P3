import { useEffect, useState } from "react";
import { shortTopicId, topicRequest } from "./topicRequest.js";
import "./TopicUniversityComparison.css";

export default function TopicUniversityComparison({ followedTopics }) {
  const [topic, setTopic] = useState(followedTopics[0].topicId);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const key = `${topic}:${month}:${attempt}`;
  useEffect(() => {
    if (!month) return;
    const controller = new AbortController();
    topicRequest(`topics/${shortTopicId(topic)}/universities?${new URLSearchParams({ month })}`, {
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
  }, [topic, month, key]);
  const current = result?.key === key ? result : null;
  const rows = current?.data?.universities;
  return (
    <section className="topic-university-comparison" aria-labelledby="topic-universities-heading">
      <h2 id="topic-universities-heading">4. University comparison</h2>
      <div className="topic-comparison-filters">
        <label>
          Primary topic
          <select
            value={topic}
            onChange={(event) => {
              setTopic(event.target.value);
              setPage(1);
            }}
          >
            {followedTopics.map((item) => (
              <option value={item.topicId} key={item.topicId}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Publication month
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <p>
        Each paper counts once per university. Collaborative papers can count towards multiple
        universities. Comparisons use primary topics and refresh every seven days from the stored
        index.
      </p>
      {!month ? (
        <p role="status">Choose a publication month.</p>
      ) : !current ? (
        <p role="status">Loading university comparison…</p>
      ) : current.error ? (
        <p role="alert">
          {current.error}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry comparison
          </button>
        </p>
      ) : rows?.length ? (
        <>
          <div className="topic-table-scroll">
            <table>
              <caption>University paper counts · {month}</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">University</th>
                  <th scope="col">Papers</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * 20, page * 20).map((row) => (
                  <tr key={row.id}>
                    <td>{row.rank}</td>
                    <th scope="row">
                      <a
                        href={`/papers?${new URLSearchParams({ institution: row.id.split("/").at(-1), month })}`}
                      >
                        {row.name}
                      </a>
                    </th>
                    <td>{row.papers.toLocaleString("en")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="paper-pagination" aria-label="University comparison pages">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(rows.length / 20)}
            </span>
            <button
              type="button"
              disabled={page * 20 >= rows.length}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </nav>
        </>
      ) : (
        <p role="status">No university papers match this topic and month.</p>
      )}
      {current?.data && (
        <p className="topic-comparison-date">
          Snapshot: {new Date(current.data.calculatedAt).toLocaleString("en-US")}
        </p>
      )}
    </section>
  );
}
