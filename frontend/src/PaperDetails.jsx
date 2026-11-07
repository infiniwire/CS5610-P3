import { useEffect, useRef, useState } from "react";
import SavedPaperControls from "./SavedPaperControls.jsx";
import "./PaperDetails.css";

const types = {
  article: "Journal article",
  "conference-paper": "Conference paper",
  review: "Review",
  "data-paper": "Data paper",
  "software-paper": "Software paper",
};
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? dateFormat.format(date) : "Not recorded";
}

function ExternalLink({ href, children }) {
  try {
    if (!["https:", "http:"].includes(new URL(href).protocol)) return children;
  } catch {
    return children;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export default function PaperDetails({ selectedPaper, onClose, onSavedChange }) {
  const dialog = useRef(null);
  const [paper, setPaper] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const workId = selectedPaper.openAlexId.split("/").at(-1);
    setError("");
    fetch(`/api/papers/${encodeURIComponent(workId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "This paper is no longer available in the index."
              : "Could not load paper details. Please try again.",
          );
        return response.json();
      })
      .then(({ paper: details }) => {
        if (!controller.signal.aborted) setPaper(details);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [selectedPaper.openAlexId, attempt]);

  return (
    <dialog
      className="paper-details"
      ref={dialog}
      aria-labelledby="paper-detail-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          event.currentTarget.close();
        }
      }}
    >
      <div className="paper-detail-heading">
        <span>Paper details</span>
        <button type="button" onClick={() => dialog.current.close()} autoFocus>
          Close
        </button>
      </div>
      <h2 id="paper-detail-title">{selectedPaper.title}</h2>
      {!paper && !error && <p role="status">Loading paper details…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}
      <SavedPaperControls openAlexId={selectedPaper.openAlexId} onSavedChange={onSavedChange} />
      {paper && (
        <>
          {paper.isRetracted && (
            <p className="paper-retraction" role="status">
              This paper has been retracted.
            </p>
          )}
          <dl className="paper-detail-metadata">
            <dt>Published</dt>
            <dd>{formatDate(paper.publicationDate)}</dd>
            <dt>Publication type</dt>
            <dd>{types[paper.type] ?? paper.type ?? "Not recorded"}</dd>
            <dt>Citations</dt>
            <dd>{new Intl.NumberFormat("en-US").format(paper.citedByCount ?? 0)}</dd>
            <dt>DOI</dt>
            <dd>
              {paper.doi ? (
                <ExternalLink href={paper.doi}>
                  {paper.doi.replace(/^https?:\/\/doi\.org\//, "")}
                </ExternalLink>
              ) : (
                "Not recorded"
              )}
            </dd>
          </dl>
          <section aria-labelledby="paper-authors-heading">
            <h3 id="paper-authors-heading">Authors</h3>
            <p>
              {paper.authors
                ?.map(({ name }) => name)
                .filter(Boolean)
                .join(", ") || "Not recorded"}
            </p>
          </section>
          <section aria-labelledby="paper-institutions-heading">
            <h3 id="paper-institutions-heading">University affiliations</h3>
            {paper.institutions?.length > 0 ? (
              <ul>
                {paper.institutions.map(({ id, name, country }) => (
                  <li key={id}>
                    {name}
                    {country && ` (${country})`}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Not recorded</p>
            )}
          </section>
          <section aria-labelledby="paper-topics-heading">
            <h3 id="paper-topics-heading">Research topics</h3>
            {paper.primaryTopic?.name && (
              <p>
                <em>Primary topic.</em> {paper.primaryTopic.name}
              </p>
            )}
            {paper.topics?.length > 0 ? (
              <ul>
                {paper.topics.map(({ id, name }) => (
                  <li key={id}>{name}</li>
                ))}
              </ul>
            ) : (
              !paper.primaryTopic?.name && <p>Not recorded</p>
            )}
          </section>
          <section aria-labelledby="paper-abstract-heading">
            <h3 id="paper-abstract-heading">Abstract</h3>
            <p>An abstract is not available in this index.</p>
          </section>
          <footer className="paper-detail-footer">
            <p className="paper-detail-links">
              <ExternalLink href={paper.sourceUrl}>View publication</ExternalLink>
              <ExternalLink href={paper.openAlexId}>View on OpenAlex</ExternalLink>
            </p>
          </footer>
        </>
      )}
    </dialog>
  );
}
