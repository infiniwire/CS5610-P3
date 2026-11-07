import { useEffect, useState } from "react";
import { loadDatasetSummary, readDatasetSummary } from "./datasetSummaryCache.js";
import "./DatasetAnalysis.css";

const labels = {
  article: "Journal articles",
  "conference-paper": "Conference papers",
  review: "Reviews",
  "data-paper": "Data papers",
  "software-paper": "Software papers",
  unknown: "Unclassified",
};

const count = new Intl.NumberFormat("en-US");
const share = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});
const snapshotDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "America/Vancouver",
});

function SummaryTable({ number, caption, category, rows, total }) {
  return (
    <table className="dataset-table">
      <caption>
        <span>Table {number}.</span> {caption}
      </caption>
      <thead>
        <tr>
          <th scope="col">{category}</th>
          <th scope="col">Records</th>
          <th scope="col">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, records }) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{count.format(records)}</td>
            <td>{share.format(records / total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td>{count.format(total)}</td>
          <td>100%</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function DatasetAnalysis() {
  const [summary, setSummary] = useState(readDatasetSummary);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadDatasetSummary()
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const largest = summary?.types[0];
  const affiliations = summary?.affiliations;
  const affiliationTotal = affiliations
    ? affiliations.usOnly + affiliations.canadaOnly + affiliations.collaboration
    : 0;

  return (
    <>
      <section className="report-section report-analysis" aria-labelledby="dataset-heading">
        <h2 id="dataset-heading">2. Dataset overview</h2>
        {failed && (
          <p role="status">
            {summary
              ? "Showing the last available statistics. An updated summary is temporarily unavailable."
              : "The dataset summary is temporarily unavailable."}
          </p>
        )}
        {!summary && !failed && <p role="status">Loading the dataset summary…</p>}
        {summary?.total === 0 && <p role="status">The index currently contains no records.</p>}
        {summary?.total > 0 && (
          <>
            <p>
              The index contains {count.format(summary.total)} records
              {summary.earliest && summary.latest && (
                <>
                  {" "}
                  ({date.format(new Date(summary.earliest))}–{date.format(new Date(summary.latest))}
                  )
                </>
              )}
              .
            </p>
            <div className="dataset-overview-tables">
              <SummaryTable
                number={1}
                caption="Publication types."
                category="Publication type"
                rows={summary.types.map(({ type, count: records }) => ({
                  label: labels[type] ?? type,
                  records,
                }))}
                total={summary.total}
              />
              {affiliationTotal > 0 ? (
                <SummaryTable
                  number={2}
                  caption="Country affiliation."
                  category="Affiliation group"
                  rows={[
                    { label: "United States only", records: affiliations.usOnly },
                    { label: "Canada only", records: affiliations.canadaOnly },
                    { label: "U.S.–Canada collaboration", records: affiliations.collaboration },
                  ]}
                  total={affiliationTotal}
                />
              ) : (
                <p>No records have a qualifying country affiliation.</p>
              )}
            </div>
            <p>
              {labels[largest.type] ?? largest.type} make up{" "}
              {share.format(largest.count / summary.total)} of the corpus.
              {affiliationTotal > 0 && (
                <>
                  {" "}
                  U.S.–Canada collaborations account for{" "}
                  {share.format(affiliations.collaboration / affiliationTotal)} of classified works.
                </>
              )}
            </p>
          </>
        )}
      </section>
      <footer className="report-footer report-data-notes" aria-label="Data coverage and source">
        <p>
          <span className="report-note-label">Data coverage.</span> The index includes 2026
          publications of the types shown above, with at least one U.S. or Canadian education
          affiliation, directly or through a parent institution. Each OpenAlex Work ID is counted
          once; joint U.S.–Canada papers form a separate group in Table 2.
          {summary && summary.total > affiliationTotal && (
            <>
              {" "}
              Table 2 excludes {count.format(summary.total - affiliationTotal)} records without a
              qualifying country affiliation.
            </>
          )}
          {summary?.calculatedAt && (
            <>
              {" "}
              Statistics as of {snapshotDate.format(new Date(summary.calculatedAt))}; refreshed
              weekly.
            </>
          )}
        </p>
        <p id="ref-openalex">
          [1] OpenAlex.{" "}
          <a href="https://openalex.org/">
            <em>OpenAlex scholarly index</em>
          </a>
          .
        </p>
      </footer>
    </>
  );
}
