import { useEffect, useState } from "react";
import { useReader } from "./ReaderContext.js";
import { readingStatuses, savedPaperRequest } from "./savedPaperRequest.js";
import PaperDetails from "./PaperDetails.jsx";
import SavedPaperEntry from "./SavedPaperEntry.jsx";
import "./SavedPapersPage.css";

export default function SavedPapersPage() {
  const { user, checking, requestSignIn, sessionExpired } = useReader();
  const userId = user?.id;
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState("");
  const [selectedPaper, setSelectedPaper] = useState(null);
  const queryKey = `${user?.id}:${status}:${page}:${attempt}`;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), ...(status ? { status } : {}) });
    savedPaperRequest(`?${params}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.savedPapers.length && page > 1) {
          setPage((value) => value - 1);
          return;
        }
        setResult({ key: queryKey, data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ key: queryKey, error: error.message });
        if (error.status === 401) sessionExpired();
      });
    return () => controller.abort();
  }, [userId, status, page, queryKey, sessionExpired]);

  function reload(message = "") {
    setNotice(message);
    setAttempt((value) => value + 1);
  }
  function updateItem(savedPaper) {
    setNotice("Reading notes and status saved.");
    if (status && savedPaper.readingStatus !== status) {
      reload("Reading notes and status saved.");
      return;
    }
    setResult((previous) =>
      previous?.key !== queryKey || !previous.data
        ? previous
        : {
            ...previous,
            data: {
              ...previous.data,
              savedPapers: previous.data.savedPapers.map((item) =>
                item.openAlexId === savedPaper.openAlexId ? { ...item, ...savedPaper } : item,
              ),
            },
          },
    );
  }
  const current = result?.key === queryKey ? result : null;
  const data = current?.data;
  const loading = !current;

  return (
    <section className="research-index saved-papers-page" aria-labelledby="saved-papers-heading">
      <div className="index-heading">
        <h1 id="saved-papers-heading">Saved papers</h1>
        <p>Your private reading list</p>
      </div>
      {checking ? (
        <p role="status">Checking sign-in status…</p>
      ) : !user ? (
        <div className="saved-sign-in">
          <p>Sign in to collect papers, keep notes, and track your reading.</p>
          <button type="button" onClick={requestSignIn}>
            Sign in
          </button>
        </div>
      ) : (
        <>
          <p className="saved-page-intro">
            A personal bibliography. Save papers from their detail view; expand an entry below to
            edit your notes and reading status.
          </p>
          <div className="saved-page-filter">
            <label>
              Reading status
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                  setNotice("");
                }}
              >
                <option value="">All saved papers</option>
                {Object.entries(readingStatuses).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {data && (
              <p>
                {data.total.toLocaleString("en")} {data.total === 1 ? "paper" : "papers"}
              </p>
            )}
          </div>
          {notice && <p role="status">{notice}</p>}
          <section aria-label="Saved paper results" aria-busy={loading}>
            {loading && <p role="status">Loading saved papers…</p>}
            {current?.error && (
              <p role="alert">
                {current.error}{" "}
                <button type="button" onClick={() => reload()}>
                  Retry
                </button>
              </p>
            )}
            {data?.savedPapers.length === 0 && (
              <p role="status">
                {status ? (
                  "No saved papers have this reading status."
                ) : (
                  <>
                    Your reading list is empty. Browse the <a href="/papers">paper index</a> and
                    save a paper to get started.
                  </>
                )}
              </p>
            )}
            <ol className="saved-paper-list" start={(page - 1) * 20 + 1}>
              {data?.savedPapers.map((item) => (
                <li key={item.openAlexId}>
                  <SavedPaperEntry
                    item={item}
                    onOpen={setSelectedPaper}
                    onChange={updateItem}
                    onRemove={() => reload("Paper removed from your saved papers.")}
                    onReload={() => reload()}
                  />
                </li>
              ))}
            </ol>
          </section>
          {data && data.total > 0 && (
            <nav className="paper-pagination" aria-label="Saved paper pages">
              <button
                type="button"
                disabled={loading || page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span aria-live="polite">Page {page}</span>
              <button
                type="button"
                disabled={loading || !data.hasNext}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </nav>
          )}
          {selectedPaper && (
            <PaperDetails
              key={selectedPaper.openAlexId}
              selectedPaper={selectedPaper}
              onClose={() => setSelectedPaper(null)}
              onSavedChange={() => reload()}
            />
          )}
        </>
      )}
    </section>
  );
}
