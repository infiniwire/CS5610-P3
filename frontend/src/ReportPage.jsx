export default function ReportPage({ number, children }) {
  return (
    <article className="report-page" aria-label={`Page ${number}`}>
      <div className="report-sheet">
        {children}
        <footer className="report-page-number" aria-hidden="true">
          {number}
        </footer>
      </div>
    </article>
  );
}
