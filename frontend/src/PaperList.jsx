import { useState } from "react";
import PaperDetails from "./PaperDetails.jsx";

import "./PaperList.css";

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const numberFormat = new Intl.NumberFormat("en");

export default function PaperList({ papers, start }) {
  const [selectedPaper, setSelectedPaper] = useState(null);
  return (
    <>
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
        />
      )}
    </>
  );
}
