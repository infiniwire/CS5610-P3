import PropTypes from "prop-types";
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

ReportPage.propTypes = {
  number: PropTypes.number.isRequired,
  children: PropTypes.node.isRequired,
};
