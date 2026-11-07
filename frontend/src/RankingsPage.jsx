import { useEffect, useState } from "react";
import PaperDetails from "./PaperDetails.jsx";
import { loadRankings, readRankings } from "./rankingsCache.js";
import "./RankingsPage.css";

const boards = [
  {
    id: "papers",
    label: "Papers",
    entity: "Paper",
    heading: "Most cited papers",
    note: "Each paper is ranked by its cumulative recorded citation count. Select a title to view its details.",
  },
  {
    id: "universities",
    label: "Universities",
    entity: "University",
    heading: "University rankings",
    note: "A paper is credited once to each indexed university. Select a university to browse its papers.",
  },
  {
    id: "authors",
    label: "Authors",
    entity: "Author",
    heading: "Author rankings",
    note: "Authors are identified by OpenAlex Author ID. Same-name authors remain separate; repeated IDs within one paper count once. Names link to OpenAlex profiles.",
  },
  {
    id: "topics",
    label: "Topics",
    entity: "Primary research topic",
    heading: "Research topic rankings",
    note: "Each paper contributes only to its primary topic. Overlapping secondary tags are excluded. Topic names link to OpenAlex.",
  },
];
const format = (value) =>
  value > 0 && value < 0.01
    ? "<0.01"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const publicationDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(value),
      )
    : "Not recorded";
const pageSize = 20;

function EntityLink({ board, row }) {
  if (board === "universities") {
    return (
      <a href={`/papers?institution=${encodeURIComponent(row.id.split("/").at(-1))}`}>{row.name}</a>
    );
  }
  return (
    <>
      <a href={row.id} target="_blank" rel="noreferrer">
        {row.name}
      </a>
      {board === "authors" && <span className="ranking-identity">{row.id.split("/").at(-1)}</span>}
    </>
  );
}

export default function RankingsPage() {
  const [data, setData] = useState(readRankings);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [board, setBoard] = useState("papers");
  const [metric, setMetric] = useState("citations");
  const [page, setPage] = useState(1);
  const [selectedPaper, setSelectedPaper] = useState(null);

  useEffect(() => {
    let active = true;
    setFailed(false);
    loadRankings()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function selectBoard(value) {
    setBoard(value);
    setMetric(value === "universities" ? "papers" : "citations");
    setPage(1);
  }

  function moveTab(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % boards.length;
    if (event.key === "ArrowLeft") next = (index + boards.length - 1) % boards.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = boards.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectBoard(boards[next].id);
    document.getElementById(`rankings-tab-${boards[next].id}`).focus();
  }

  const config = boards.find((entry) => entry.id === board);
  const meanRanking = board === "universities" && metric === "meanCitations";
  const boardKey = meanRanking
    ? "byMeanCitations"
    : metric === "papers"
      ? "byPapers"
      : "byCitations";
  const rows = (data ? (board === "papers" ? data.papers : data[board][boardKey]) : []) ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shown = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const scoreLabel = meanRanking ? "Mean citations" : metric === "papers" ? "Papers" : "Citations";

  return (
    <article className="rankings-page">
      <header className="rankings-title">
        <h1>Research rankings</h1>
        <p>PaperPulse · U.S. and Canadian university research · 2026</p>
      </header>
      <p className="rankings-intro">
        Compare papers, universities, authors, and research topics within the PaperPulse index.
        These rankings describe the stored 2026 corpus, rather than worldwide or career-long
        performance.
      </p>
      {failed && (
        <p role="status">
          {data
            ? "Showing the last available rankings. An updated snapshot is temporarily unavailable."
            : "Rankings are temporarily unavailable."}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}
      {!data && !failed && <p role="status">Preparing the ranking snapshot…</p>}
      <div className="rankings-tabs" role="tablist" aria-label="Ranking categories">
        {boards.map((entry, index) => (
          <button
            key={entry.id}
            id={`rankings-tab-${entry.id}`}
            role="tab"
            type="button"
            aria-selected={board === entry.id}
            aria-controls="ranking-panel"
            tabIndex={board === entry.id ? 0 : -1}
            onClick={() => selectBoard(entry.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id="ranking-panel"
        aria-labelledby={`rankings-tab-${board}`}
        tabIndex={0}
      >
        <div className="ranking-heading">
          <h2>{config.heading}</h2>
          {board !== "papers" && (
            <div className="ranking-order">
              <label htmlFor="ranking-order">Rank by</label>
              <select
                id="ranking-order"
                value={metric}
                onChange={(event) => {
                  setMetric(event.target.value);
                  setPage(1);
                }}
              >
                <option value="citations">Total citations</option>
                <option value="papers">Paper count</option>
                {board === "universities" && <option value="meanCitations">Mean citations</option>}
              </select>
            </div>
          )}
        </div>
        <p className="ranking-note">{config.note}</p>
        {meanRanking && (
          <p className="ranking-note">
            Mean citations = total recorded citations ÷ papers with citation data. All universities
            with at least one such paper are eligible; a small number of highly cited papers can
            produce a high mean. Ranks use unrounded means.
          </p>
        )}
        {data && (
          <>
            <div
              className="ranking-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={`${config.label} ranking table`}
            >
              <table
                className={`ranking-table ${board === "papers" ? "ranking-paper-table" : "ranking-entity-table"}`}
              >
                <caption>
                  {board === "papers" ? "Papers" : config.label} ranked by{" "}
                  {scoreLabel.toLowerCase()} · Top {rows.length} entries
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">{config.entity}</th>
                    {board !== "papers" && (
                      <th scope="col" aria-sort={metric === "papers" ? "descending" : "none"}>
                        Papers
                      </th>
                    )}
                    <th scope="col" aria-sort={metric === "citations" ? "descending" : "none"}>
                      Citations
                    </th>
                    {board !== "papers" && (
                      <th scope="col" aria-sort={meanRanking ? "descending" : "none"}>
                        Mean citations
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id}>
                      <td className="ranking-position">{row.rank}</td>
                      <th scope="row">
                        {board === "papers" ? (
                          <>
                            <button
                              type="button"
                              className="ranking-title-button"
                              aria-haspopup="dialog"
                              onClick={() => setSelectedPaper(row)}
                            >
                              {row.title}
                            </button>
                            <span className="ranking-authors">
                              {row.authors
                                ?.slice(0, 3)
                                .map(({ name }) => name)
                                .filter(Boolean)
                                .join(", ")}
                              {row.authors?.length > 3 && ", et al."}
                            </span>
                            <span className="ranking-publication-date">
                              {publicationDate(row.publicationDate)}
                            </span>
                          </>
                        ) : (
                          <EntityLink board={board} row={row} />
                        )}
                      </th>
                      {board !== "papers" && (
                        <td className={metric === "papers" ? "ranking-score" : undefined}>
                          {format(row.papers)}
                        </td>
                      )}
                      <td className={metric === "citations" ? "ranking-score" : undefined}>
                        {board === "papers"
                          ? format(row.citedByCount)
                          : row.citationKnown
                            ? format(row.citations)
                            : "Unavailable"}
                      </td>
                      {board !== "papers" && (
                        <td className={meanRanking ? "ranking-score" : undefined}>
                          {row.meanCitations === null ? "Unavailable" : format(row.meanCitations)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && <p role="status">No ranked records are available in this category.</p>}
            <nav className="paper-pagination" aria-label="Ranking pages">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span aria-live="polite">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </nav>
            <p className="ranking-range" role="status">
              {rows.length
                ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, rows.length)} of ${rows.length} entries`
                : "0 entries"}
            </p>
          </>
        )}
      </section>
      <section className="rankings-methods" aria-labelledby="rankings-methods-heading">
        <h2 id="rankings-methods-heading">How to read these rankings</h2>
        <p>
          Each list contains up to 100 entries selected from the entire indexed corpus before
          pagination. Equal scores receive the same rank (1, 1, 3); OpenAlex IDs provide a stable
          order within ties. A tie may extend beyond the displayed cutoff.
        </p>
        <p>
          University and author totals give full credit for each affiliated or co-authored paper.
          These totals overlap across entities and should not be added together. Authors without an
          OpenAlex ID and papers without a primary topic are excluded from their respective lists.
        </p>
        <p>
          Citations are cumulative counts stored with each paper, not citations received in 2026
          alone. They are not adjusted for field, publication type, or publication age, and do not
          establish research quality. Mean citations use papers with recorded citation counts.
          Rankings refresh every seven days from the stored corpus.
        </p>
      </section>
      {selectedPaper && (
        <PaperDetails
          key={selectedPaper.openAlexId}
          selectedPaper={selectedPaper}
          onClose={() => setSelectedPaper(null)}
        />
      )}
    </article>
  );
}
