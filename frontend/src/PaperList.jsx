import "./PaperList.css";

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const numberFormat = new Intl.NumberFormat("en");

export default function PaperList({ papers, start }) {
  return (
    <ol className="paper-list" start={start}>
      {papers.map((paper) => {
        const authors = paper.authors.slice(0, 3).map(({ name }) => name).filter(Boolean);
        const date = new Date(paper.publicationDate);

        return (
          <li key={paper.openAlexId}>
            <article>
              <h2>
                <a href={paper.openAlexId} target="_blank" rel="noreferrer">{paper.title}</a>
              </h2>
              {authors.length > 0 && (
                <p>{authors.join(", ")}{paper.authors.length > 3 && ", et al."}</p>
              )}
              <p>{paper.institutions.map(({ name }) => name).join(" · ")}</p>
              <p className="paper-metadata">
                <time dateTime={paper.publicationDate.slice(0, 10)}>{dateFormat.format(date)}</time>
                <span>{numberFormat.format(paper.citedByCount)} {paper.citedByCount === 1 ? "citation" : "citations"}</span>
              </p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
