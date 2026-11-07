import { readingStatuses } from "./savedPaperRequest.js";
import SavedPaperEditor from "./SavedPaperEditor.jsx";
import "./SavedPaperEntry.css";

const dates = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default function SavedPaperEntry({ item, onOpen, onChange, onRemove, onReload }) {
  const paper = item.paper;
  return (
    <article className="saved-paper-entry">
      <h2>
        {paper ? (
          <button
            className="saved-paper-title"
            type="button"
            aria-haspopup="dialog"
            onClick={() => onOpen(paper)}
          >
            {paper.title}
          </button>
        ) : (
          "Paper no longer available in the index"
        )}
      </h2>
      {paper?.authors?.length > 0 && (
        <p>
          {paper.authors
            .slice(0, 3)
            .map(({ name }) => name)
            .join(", ")}
          {paper.authors.length > 3 ? ", et al." : ""}
        </p>
      )}
      <p className="saved-paper-meta">
        Saved {dates.format(new Date(item.createdAt))}
        {paper && <> · {new Intl.NumberFormat("en").format(paper.citedByCount ?? 0)} citations</>}
      </p>
      {item.notes && (
        <p className="saved-notes-preview">
          {item.notes.slice(0, 180)}
          {item.notes.length > 180 ? "…" : ""}
        </p>
      )}
      <details className="saved-entry-notes">
        <summary>{readingStatuses[item.readingStatus]} · Notes and reading status</summary>
        <SavedPaperEditor
          key={item.revision}
          savedPaper={item}
          onChange={onChange}
          onRemove={onRemove}
          onReload={onReload}
        />
      </details>
    </article>
  );
}
