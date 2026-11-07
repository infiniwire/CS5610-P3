import { useEffect, useState } from "react";
import PaperDetails from "./PaperDetails.jsx";
import PaperSaveButton from "./PaperSaveButton.jsx";
import { useReader } from "./ReaderContext.js";
import { savedPaperRequest } from "./savedPaperRequest.js";
import "./PaperList.css";

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const numberFormat = new Intl.NumberFormat("en");

export default function PaperList({ papers, start }) {
  const { user, sessionExpired } = useReader();
  const userId = user?.id;
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [savedState, setSavedState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const ids = papers.map(({ openAlexId }) => openAlexId.split("/").at(-1)).join(",");
  const statusKey = `${userId}:${ids}:${attempt}`;

  useEffect(() => {
    if (!userId || !ids) return;
    const controller = new AbortController();
    savedPaperRequest(`/status?${new URLSearchParams({ ids })}`, { signal: controller.signal })
      .then(({ savedIds }) => {
        if (!controller.signal.aborted)
          setSavedState({ key: statusKey, savedIds: new Set(savedIds) });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSavedState({ key: statusKey, error: error.message });
        if (error.status === 401) sessionExpired();
      });
    return () => controller.abort();
  }, [userId, ids, statusKey, sessionExpired]);

  const current = savedState?.key === statusKey ? savedState : null;
  function markSaved(openAlexId, owner) {
    if (owner !== userId) return;
    setSavedState((previous) =>
      previous?.key === statusKey && previous.savedIds
        ? {
            ...previous,
            savedIds: new Set([...previous.savedIds, openAlexId]),
          }
        : previous,
    );
  }

  return (
    <>
      {user && current?.error && (
        <p role="alert">
          Could not check saved papers. {current.error}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry saved status
          </button>
        </p>
      )}
      <ol className="paper-list" start={start}>
        {papers.map((paper) => {
          const authors = paper.authors
            .slice(0, 3)
            .map(({ name }) => name)
            .filter(Boolean);
          const date = new Date(paper.publicationDate);

          return (
            <li key={paper.openAlexId}>
              <article>
                <h3>
                  <button
                    className="paper-title-button"
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setSelectedPaper(paper)}
                  >
                    {paper.title}
                  </button>
                </h3>
                {authors.length > 0 && (
                  <p>
                    {authors.join(", ")}
                    {paper.authors.length > 3 && ", et al."}
                  </p>
                )}
                <p>{paper.institutions.map(({ name }) => name).join(" · ")}</p>
                <p className="paper-metadata">
                  <time dateTime={paper.publicationDate.slice(0, 10)}>
                    {dateFormat.format(date)}
                  </time>
                  <span>
                    {numberFormat.format(paper.citedByCount)}{" "}
                    {paper.citedByCount === 1 ? "citation" : "citations"}
                  </span>
                  <PaperSaveButton
                    key={userId ?? "guest"}
                    paper={paper}
                    saved={Boolean(user && current?.savedIds?.has(paper.openAlexId))}
                    loading={Boolean(user && !current)}
                    unavailable={Boolean(user && current?.error)}
                    onSaved={markSaved}
                  />
                </p>
              </article>
            </li>
          );
        })}
      </ol>
      {selectedPaper && (
        <PaperDetails
          key={selectedPaper.openAlexId}
          selectedPaper={selectedPaper}
          onClose={() => setSelectedPaper(null)}
          onSavedChange={() => setAttempt((value) => value + 1)}
        />
      )}
    </>
  );
}
