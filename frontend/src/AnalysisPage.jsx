import { useEffect, useState } from "react";
import { loadAnalysis, readAnalysis } from "./analysisCache.js";
import CountryAnalysis, { countryNames } from "./CountryAnalysis.jsx";
import {
  Figure,
  TopicBars,
  CitationBars,
  MonthlyLine,
  TypeDonut,
  AffiliationStack,
  TopicHeatmap,
  UniversityScatter,
  LorenzCurve,
  number,
  percent,
  monthLabel,
} from "./AnalysisCharts.jsx";
import "./AnalysisPage.css";

const typeNames = {
  article: "Journal articles",
  review: "Reviews",
  "conference-paper": "Conference papers",
  "data-paper": "Data papers",
  "software-paper": "Software papers",
  unknown: "Unclassified",
};
const date = (value) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
const snapshotDate = (value) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Vancouver" }).format(
    new Date(value),
  );
const byCount = (a, b) => b.count - a.count;

function AnalysisContent({ data }) {
  const { overview, topics, citations, monthly, heatmap, universities } = data;
  const total = overview.total;
  if (!total) return <p role="status">The index currently contains no papers to analyse.</p>;
  const types = data.types.map((row) => ({ ...row, name: typeNames[row.name] ?? row.name }));
  const countries = ["usOnly", "canadaOnly", "collaboration", "unclassified"]
    .map((name) => ({
      name: countryNames[name],
      count: data.affiliations.find((row) => row.name === name)?.count ?? 0,
    }))
    .filter((row) => row.count > 0);
  const leadingTopic = topics[0];
  const leadingType = types[0];
  const topTopicShare = topics.reduce((sum, row) => sum + row.count, 0) / total;
  const latest = overview.latest ? new Date(overview.latest) : null;
  const earliest = overview.earliest ? new Date(overview.earliest) : null;
  const lastMonthPartial =
    latest &&
    latest.getUTCDate() !==
      new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 0)).getUTCDate();
  const complete = monthly.filter(
    (row, i) =>
      !(i === 0 && earliest?.getUTCDate() !== 1) && !(i === monthly.length - 1 && lastMonthPartial),
  );
  const peak = [...complete].sort(byCount)[0];
  const topMean = [...universities]
    .filter((row) => row.meanCitations !== null)
    .sort((a, b) => b.meanCitations - a.meanCitations)[0];
  const zero = citations.bins[0]?.count ?? 0;
  const collaboration = data.affiliations.find((row) => row.name === "collaboration")?.count ?? 0;
  const heatPeak = heatmap
    .flatMap((topic) => topic.months.map((cell) => ({ ...cell, name: topic.name })))
    .sort(byCount)[0];

  return (
    <>
      <p className="analysis-abstract">
        <span>Abstract.</span> This report describes {number(total)} publications indexed by
        PaperPulse
        {overview.earliest && overview.latest && (
          <>
            {" "}
            from {date(overview.earliest)} to {date(overview.latest)}
          </>
        )}
        .
        {citations.known > 0 && (
          <>
            {" "}
            The mean citation count is {number(citations.mean)}, compared with a median of{" "}
            {number(citations.median)}.
          </>
        )}
        {citations.topTenShare !== null && (
          <>
            {" "}
            The most cited tenth of papers accounts for {percent(citations.topTenShare)} of recorded
            citations.
          </>
        )}{" "}
        Ten figures examine research topics, publication patterns, country comparisons, and citation
        concentration.
      </p>
      <dl className="analysis-summary">
        <div>
          <dt>Indexed papers</dt>
          <dd>{number(total)}</dd>
        </div>
        <div>
          <dt>Recorded citations</dt>
          <dd>{number(citations.total)}</dd>
        </div>
        <div>
          <dt>Median citations</dt>
          <dd>{citations.median === null ? "Unavailable" : number(citations.median)}</dd>
        </div>
        <div>
          <dt>Zero recorded citations</dt>
          <dd>{citations.known ? percent(zero / citations.known) : "Unavailable"}</dd>
        </div>
      </dl>
      <p className="analysis-snapshot">
        Statistics calculated {snapshotDate(data.calculatedAt)} · Next scheduled refresh{" "}
        {snapshotDate(data.nextRefreshAt)} · Updated weekly
      </p>
      <nav className="analysis-contents" aria-label="Analysis sections">
        {[
          "Topics",
          "Citations",
          "Publication timeline",
          "Publication types",
          "Countries",
          "Topic seasonality",
          "Universities",
          "Citation concentration",
        ].map((label, i) => (
          <a href={`#analysis-${i + 1}`} key={label}>
            {i + 1}. {label}
          </a>
        ))}
      </nav>

      <section className="analysis-section" id="analysis-1" aria-labelledby="analysis-heading-1">
        <h2 id="analysis-heading-1">1. Research topic distribution</h2>
        <Figure
          id="figure-topics"
          number={1}
          title="The eight leading primary research topics."
          description="One primary topic per paper. Percentages use all indexed papers as the denominator."
          columns={["Primary topic", "Papers", "Share of index"]}
          rows={topics.map((row) => [row.name, number(row.count), percent(row.count / total)])}
        >
          <TopicBars data={topics} total={total} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {leadingTopic ? (
            <>
              {leadingTopic.name} is the largest primary topic, with {number(leadingTopic.count)}{" "}
              papers ({percent(leadingTopic.count / total)} of the index). Together, the leading
              eight topics account for {percent(topTopicShare)}. The remaining{" "}
              {percent(1 - topTopicShare)} lies outside this leading group, so these topics should
              not be read as a description of the whole corpus.
            </>
          ) : (
            <>No primary-topic classifications are recorded.</>
          )}{" "}
          {number(data.topicMissing)} papers have no primary topic. Secondary topic tags can
          overlap; they are excluded from these mutually exclusive counts.
        </p>
      </section>

      <section className="analysis-section" id="analysis-2" aria-labelledby="analysis-heading-2">
        <h2 id="analysis-heading-2">2. Citation distribution</h2>
        <Figure
          id="figure-citations"
          number={2}
          title="Distribution of citation counts."
          description="Ordered citation bands; bar height shows the number of papers, not a probability density. Band widths differ."
          columns={["Citations per paper", "Papers", "Share with citation data"]}
          rows={citations.bins.map((row) => [
            row.label,
            number(row.count),
            citations.known ? percent(row.count / citations.known) : "—",
          ])}
        >
          <CitationBars data={citations.bins} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {citations.known ? (
            <>
              {number(zero)} papers ({percent(zero / citations.known)}) have zero recorded
              citations. The mean is {number(citations.mean)}, while the median is{" "}
              {number(citations.median)}.{" "}
              {citations.mean > citations.median
                ? "The higher mean reflects a tail of papers with substantially more citations than a typical paper."
                : "The mean and median summarise different aspects of this distribution."}{" "}
              Newer publications have had less time to attract citations, so zero citations should
              not be interpreted as a measure of quality.
            </>
          ) : (
            <>Citation counts are unavailable.</>
          )}
          {citations.missing > 0 && (
            <>
              {" "}
              {number(citations.missing)} papers with missing or invalid citation counts are
              excluded.
            </>
          )}
        </p>
      </section>

      <section className="analysis-section" id="analysis-3" aria-labelledby="analysis-heading-3">
        <h2 id="analysis-heading-3">3. Monthly publication pattern</h2>
        <Figure
          id="figure-timeline"
          number={3}
          title="Indexed publications by publication month."
          description="Publication dates, rather than database import dates. Months outside the observed period are omitted."
          columns={["Publication month", "Papers"]}
          rows={monthly.map((row) => [row.month, number(row.count)])}
        >
          <MonthlyLine data={monthly} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {peak ? (
            <>
              {monthLabel(peak.month)} has the largest count among months fully covered by the
              observed date range, with {number(peak.count)} papers.
            </>
          ) : (
            <>There is not yet a complete calendar month within the observed date range.</>
          )}
          {lastMonthPartial && (
            <>
              {" "}
              The final month is partial through {date(overview.latest)} and should not be compared
              directly with a full month.
            </>
          )}{" "}
          This is a picture of the indexed corpus; differences can reflect publication scheduling
          and incomplete source coverage, and do not by themselves establish a change in research
          activity.
          {data.publicationDateMissing > 0 && (
            <>
              {" "}
              {number(data.publicationDateMissing)} papers with missing publication dates are
              excluded.
            </>
          )}
        </p>
      </section>

      <section className="analysis-section" id="analysis-4" aria-labelledby="analysis-heading-4">
        <h2 id="analysis-heading-4">4. Publication type composition</h2>
        <Figure
          id="figure-types"
          number={4}
          title="Composition of the corpus by publication type."
          description="Every paper contributes to exactly one type. Shares sum to 100%, subject to rounding."
          columns={["Publication type", "Papers", "Share"]}
          rows={types.map((row) => [row.name, number(row.count), percent(row.count / total)])}
        >
          <TypeDonut data={types} total={total} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {leadingType && (
            <>
              {leadingType.name} account for {percent(leadingType.count / total)} of the corpus (
              {number(leadingType.count)} records). The remaining publication types make up{" "}
              {percent(1 - leadingType.count / total)}.
            </>
          )}{" "}
          The overall citation and topic patterns therefore reflect this publication mix; they
          should not be treated as equally representative of all publication formats.
        </p>
      </section>

      <section className="analysis-section" id="analysis-5" aria-labelledby="analysis-heading-5">
        <h2 id="analysis-heading-5">5. Country comparison</h2>
        <Figure
          id="figure-affiliation"
          number={5}
          title="Distribution by U.S. and Canadian affiliation."
          description="Mutually exclusive groups based on indexed university affiliations. Cross-country papers are counted once."
          columns={["Affiliation group", "Papers", "Share"]}
          rows={countries.map((row) => [row.name, number(row.count), percent(row.count / total)])}
        >
          <AffiliationStack data={countries} total={total} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em> {number(collaboration)} papers ({percent(collaboration / total)}) list
          qualifying affiliations in both countries. These records form their own group, rather than
          inflating both country-only totals. Affiliation describes the institutions on the paper,
          not author citizenship; partners outside the U.S. and Canada are outside this
          classification.
        </p>
        <CountryAnalysis
          data={data}
          completeMonths={complete}
          lastMonthPartial={lastMonthPartial}
        />
      </section>

      <section className="analysis-section" id="analysis-6" aria-labelledby="analysis-heading-6">
        <h2 id="analysis-heading-6">6. Topics across publication months</h2>
        <Figure
          id="figure-heatmap"
          number={8}
          title="Monthly counts within the six leading primary topics."
          description="One shared colour scale shows absolute paper counts. The topic set is fixed across months."
          columns={["Primary topic", ...monthly.map((row) => row.month)]}
          rows={heatmap.map((row) => [row.name, ...row.months.map((cell) => number(cell.count))])}
        >
          <TopicHeatmap data={heatmap} months={monthly} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {heatPeak && (
            <>
              The largest displayed topic–month cell is {heatPeak.name} in{" "}
              {monthLabel(heatPeak.month)}, with {number(heatPeak.count)} papers.
            </>
          )}{" "}
          Darker cells indicate larger monthly counts, not a greater share within that topic.
          {lastMonthPartial && <> The last column covers a partial month.</>} The matrix supports
          comparisons of timing within this selected group; it does not establish that a topic is
          growing across the entire research landscape.
        </p>
      </section>

      <section className="analysis-section" id="analysis-7" aria-labelledby="analysis-heading-7">
        <h2 id="analysis-heading-7">7. University output and citations</h2>
        <Figure
          id="figure-universities"
          number={9}
          title="Publication volume and average citations at universities."
          description="The 30 universities with the most indexed papers. Points 1–3 mark the three largest by publication count."
          columns={["University", "Papers", "Mean citations", "Papers with citation data"]}
          rows={universities.map((row, i) => [
            `${i + 1}. ${row.name}`,
            number(row.count),
            row.meanCitations === null ? "Unavailable" : number(row.meanCitations),
            number(row.citationKnown),
          ])}
        >
          <UniversityScatter data={universities} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {universities[0] && (
            <>
              {universities[0].name} has the largest indexed output, with{" "}
              {number(universities[0].count)} papers.
            </>
          )}
          {topMean && (
            <>
              {" "}
              Within these universities, {topMean.name} has the highest mean citation count (
              {number(topMean.meanCitations)} per paper).
            </>
          )}{" "}
          A paper is credited once to each listed university, so university counts overlap. These
          averages are sensitive to outliers and are not adjusted for field, publication type, or
          time since publication; this figure is not a ranking of research quality.
        </p>
      </section>

      <section className="analysis-section" id="analysis-8" aria-labelledby="analysis-heading-8">
        <h2 id="analysis-heading-8">8. Citation concentration</h2>
        <Figure
          id="figure-concentration"
          number={10}
          title="Lorenz curve of recorded citations."
          description="Papers are ranked from least to most cited. The dashed diagonal represents equal citation counts for every paper."
          columns={["Cumulative share of papers", "Cumulative share of citations"]}
          rows={citations.lorenz
            .filter((_, i) => i % 10 === 0 || i === 99)
            .map((row) => [percent(row.papers), percent(row.citations)])}
        >
          {citations.total > 0 ? (
            <LorenzCurve data={citations.lorenz} />
          ) : (
            <p>No citations are available for a concentration curve.</p>
          )}
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {citations.topTenShare !== null ? (
            <>
              The most cited 10% of papers account for {percent(citations.topTenShare)} of all
              recorded citations. A curve farther below the equality line indicates greater
              concentration. This explains why a corpus-wide average can obscure the experience of
              the majority of papers.
            </>
          ) : (
            <>Citation concentration cannot be calculated without recorded citations.</>
          )}{" "}
          The curve includes uncited papers with known counts and uses the same citation population
          as Figure 2.
        </p>
      </section>
      <section className="analysis-methods" aria-labelledby="analysis-methods-heading">
        <h2 id="analysis-methods-heading">Data and scope</h2>
        <p>
          All figures use the stored OpenAlex records in PaperPulse: 2026 publications associated
          with U.S. or Canadian education institutions. Each OpenAlex Work ID represents one paper.
          Topic figures use the primary topic, not overlapping secondary tags. Citation counts are
          cumulative at collection time, and do not measure citations received in 2026 alone. The
          statistics are regenerated every seven days from the stored corpus; this does not fetch
          new papers.
        </p>
        <p>
          Source:{" "}
          <a href="https://openalex.org/" target="_blank" rel="noreferrer">
            OpenAlex
          </a>
          . Values and denominators for each figure are available under “View data”.
        </p>
      </section>
    </>
  );
}

export default function AnalysisPage() {
  const [data, setData] = useState(readAnalysis);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    loadAnalysis()
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
  return (
    <article className="analysis-manuscript">
      <header className="analysis-title">
        <h1>Research analysis</h1>
        <p>PaperPulse · U.S. and Canadian university research · 2026</p>
      </header>
      {failed && (
        <p role="status">
          {data
            ? "Showing the last available snapshot. Updated statistics are temporarily unavailable."
            : "Analysis is temporarily unavailable."}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}
      {!data && !failed && <p role="status">Preparing the analysis snapshot…</p>}
      {data && <AnalysisContent data={data} />}
    </article>
  );
}
