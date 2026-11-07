import {
  Figure,
  CountryCitationBars,
  CountryMonthlyStack,
  number,
  percent,
} from "./AnalysisCharts.jsx";

export const countryNames = {
  usOnly: "United States only",
  canadaOnly: "Canada only",
  collaboration: "U.S.–Canada collaboration",
  unclassified: "Unclassified",
};

export default function CountryAnalysis({ data, completeMonths, lastMonthPartial }) {
  const countries = data.countryAnalysis.groups.map((row) => ({
    ...row,
    name: countryNames[row.id] ?? row.id,
  }));
  const known = countries.filter((row) => row.meanCitations !== null);
  const highestMean = [...known].sort((a, b) => b.meanCitations - a.meanCitations)[0];
  const joint = countries.find((row) => row.id === "collaboration");
  const us = countries.find((row) => row.id === "usOnly");
  const canada = countries.find((row) => row.id === "canadaOnly");
  const shares = completeMonths
    .filter((row) => row.count > 0)
    .map((row) => (joint?.months.find((cell) => cell.month === row.month)?.count ?? 0) / row.count);
  const minShare = shares.length ? Math.min(...shares) : null;
  const maxShare = shares.length ? Math.max(...shares) : null;
  const missing = countries.reduce((sum, row) => sum + row.count - row.citationKnown, 0);
  return (
    <>
      <div className="country-analysis-detail">
        <h3>5.1 Citation comparison</h3>
        <Figure
          id="figure-country-citations"
          number={6}
          title="Average citations by country affiliation."
          description="Cumulative recorded citations per paper with known citation data. Groups are mutually exclusive; a collaboration is not counted in either country-only group."
          columns={[
            "Affiliation group",
            "Papers",
            "Citations",
            "Papers with citation data",
            "Mean citations",
            "Cited at least once",
          ]}
          rows={countries.map((row) => [
            row.name,
            number(row.count),
            number(row.citations),
            number(row.citationKnown),
            row.meanCitations === null ? "Unavailable" : number(row.meanCitations),
            row.citationKnown ? percent(row.cited / row.citationKnown) : "Unavailable",
          ])}
        >
          <CountryCitationBars data={countries} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {highestMean ? (
            <>
              {highestMean.name} has the highest observed mean, at{" "}
              {number(highestMean.meanCitations)} citations per paper with citation data (
              {number(highestMean.citationKnown)} papers).
            </>
          ) : (
            <>Citation data are not available for this comparison.</>
          )}
          {us?.meanCitations != null && canada?.meanCitations != null && (
            <>
              {" "}
              The country-only means are {number(us.meanCitations)} for the United States and{" "}
              {number(canada.meanCitations)} for Canada.
            </>
          )}{" "}
          These are descriptive differences within the indexed corpus. Field mix, publication type,
          publication age, and highly cited outliers can influence the averages; the comparison does
          not establish that a country or international collaboration causes higher impact.
          {missing > 0 && (
            <>
              {" "}
              {number(missing)} papers without valid citation counts are excluded from the means and
              cited-paper percentages.
            </>
          )}
        </p>
      </div>
      <div className="country-analysis-detail">
        <h3>5.2 Monthly country distribution</h3>
        <Figure
          id="figure-country-months"
          number={7}
          title="Country affiliation across publication months."
          description="Each paper contributes to one group in its publication month. Stacked totals reconcile with the monthly publication counts in Figure 3."
          columns={["Publication month", ...countries.map((row) => row.name), "Total papers"]}
          rows={data.monthly.map((row, index) => [
            row.month,
            ...countries.map((group) => number(group.months[index].count)),
            number(row.count),
          ])}
        >
          <CountryMonthlyStack data={countries} months={data.monthly} />
        </Figure>
        <p className="analysis-reading">
          <em>Analysis.</em>{" "}
          {minShare !== null ? (
            <>
              Across months fully covered by the observed date range, joint-affiliation papers
              account for{" "}
              {minShare === maxShare
                ? percent(minShare)
                : `${percent(minShare)}–${percent(maxShare)}`}{" "}
              of each month’s indexed papers.
            </>
          ) : (
            <>
              The observed date range does not yet include a complete calendar month for a
              monthly-share comparison.
            </>
          )}
          {lastMonthPartial && (
            <>
              {" "}
              The final column covers a partial month and should not be compared directly with
              complete months.
            </>
          )}{" "}
          Bar heights describe publication volume, while the colour segments separate affiliation
          groups. Differences in volume alone do not show changes in collaboration rates.
          {data.publicationDateMissing > 0 && (
            <>
              {" "}
              {number(data.publicationDateMissing)} papers with missing publication dates are
              omitted.
            </>
          )}
        </p>
      </div>
    </>
  );
}
