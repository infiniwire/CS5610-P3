import { useEffect, useState } from "react";
import ReportPage from "./ReportPage.jsx";
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
      <caption><span>Table {number}.</span> {caption}</caption>
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
  const [summary, setSummary] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/papers/summary", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Dataset summary unavailable.");
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setSummary(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const largest = summary?.types[0];
  const affiliations = summary?.affiliations;
  const affiliationTotal = affiliations
    ? affiliations.usOnly + affiliations.canadaOnly + affiliations.collaboration
    : 0;

  return (
    <ReportPage number={2}>
      <section className="report-section report-analysis" aria-labelledby="dataset-heading">
        <h2 id="dataset-heading">4. Dataset Analysis</h2>
        {failed && <p role="status">The dataset summary is temporarily unavailable.</p>}
        {!summary && !failed && <p role="status">Loading the dataset summary…</p>}
        {summary?.total === 0 && <p role="status">The index currently contains no records.</p>}
        {summary?.total > 0 && (
          <>
            <p>
              The index contains {count.format(summary.total)} records
              {summary.earliest && summary.latest && (
                <> with publication dates from {date.format(new Date(summary.earliest))} to{" "}
                  {date.format(new Date(summary.latest))}</>
              )}.
              Table 1 reports the composition of the corpus by publication type.
            </p>
            <SummaryTable
              number={1}
              caption="Composition of the PaperPulse corpus."
              category="Publication type"
              rows={summary.types.map(({ type, count: records }) => ({
                label: labels[type] ?? type,
                records,
              }))}
              total={summary.total}
            />
            <p>
              The largest category, {labels[largest.type] ?? largest.type}, accounts for{" "}
              {share.format(largest.count / summary.total)} of indexed records.
            </p>
          </>
        )}
        <h3>Affiliation by country</h3>
        <p>
          Table 2 classifies each work by the U.S. and Canadian institutions listed in
          its author affiliations. A work with affiliations in both countries contributes
          one record to the collaboration group.
        </p>
        {affiliationTotal > 0 && (
          <>
            <SummaryTable
              number={2}
              caption="Distribution by author affiliation."
              category="Affiliation group"
              rows={[
                { label: "United States only", records: affiliations.usOnly },
                { label: "Canada only", records: affiliations.canadaOnly },
                { label: "U.S.–Canada collaboration", records: affiliations.collaboration },
              ]}
              total={affiliationTotal}
            />
            <p>
              U.S.–Canada collaboration accounts for{" "}
              {share.format(affiliations.collaboration / affiliationTotal)} of classified works.
            </p>
            {summary.total > affiliationTotal && (
              <p>
                Table 2 excludes {count.format(summary.total - affiliationTotal)} records with
                no recorded U.S. or Canadian affiliation.
              </p>
            )}
          </>
        )}
        {failed && <p role="status">Affiliation counts are temporarily unavailable.</p>}
        {!summary && !failed && <p role="status">Loading affiliation counts…</p>}
        {summary && affiliationTotal === 0 && <p role="status">No records have a qualifying affiliation.</p>}
        <h3>Data coverage</h3>
        <p>
          The index includes 2026 journal articles, reviews, conference papers, data papers,
          and software papers from OpenAlex. Each work has at least one author affiliation
          linked to a U.S. or Canadian education institution, directly or through its parent
          institution. Each OpenAlex Work ID is counted once.
          {summary?.latest && <> Publication dates run through {date.format(new Date(summary.latest))}.</>}
          {summary?.calculatedAt && <> Statistics reflect the index as of {snapshotDate.format(new Date(summary.calculatedAt))}.</>}
        </p>
      </section>
      <section className="report-footer" aria-labelledby="references-heading">
        <h2 id="references-heading">References</h2>
        <p id="ref-openalex">[1] OpenAlex. <a href="https://openalex.org/"><em>OpenAlex scholarly index</em></a>.</p>
      </section>
    </ReportPage>
  );
}
