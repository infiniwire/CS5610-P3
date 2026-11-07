import { createWeeklyCache } from "./weekly-cache.js";

const groupCounts = (expression) => [
  { $group: { _id: expression, count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
];

export function citationStatistics(histogram) {
  const rows = histogram.filter((row) => row._id !== null).sort((a, b) => a._id - b._id);
  const known = rows.reduce((sum, row) => sum + row.count, 0);
  const total = rows.reduce((sum, row) => sum + row._id * row.count, 0);
  const bins = [
    { label: "0", min: 0, max: 0 },
    { label: "1", min: 1, max: 1 },
    { label: "2–5", min: 2, max: 5 },
    { label: "6–10", min: 6, max: 10 },
    { label: "11–25", min: 11, max: 25 },
    { label: "26–100", min: 26, max: 100 },
    { label: "101–500", min: 101, max: 500 },
    { label: "501+", min: 501, max: null },
  ].map((bin) => ({
    ...bin,
    count: rows.reduce(
      (sum, row) =>
        sum + (row._id >= bin.min && (bin.max === null || row._id <= bin.max) ? row.count : 0),
      0,
    ),
  }));
  function atRank(rank) {
    let count = 0;
    for (const row of rows) {
      count += row.count;
      if (rank < count) return row._id;
    }
    return 0;
  }
  const median = known
    ? (atRank(Math.floor((known - 1) / 2)) + atRank(Math.floor(known / 2))) / 2
    : null;
  const lorenz = Array.from({ length: 101 }, (_, p) => {
    let remaining = (known * p) / 100;
    let citations = 0;
    for (const row of rows) {
      const take = Math.min(remaining, row.count);
      citations += take * row._id;
      remaining -= take;
      if (remaining <= 0) break;
    }
    return { papers: p / 100, citations: total ? citations / total : 0 };
  });
  return {
    known,
    missing: histogram.find((row) => row._id === null)?.count ?? 0,
    total,
    mean: known ? total / known : null,
    median,
    bins,
    lorenz,
    topTenShare: total ? 1 - lorenz[90].citations : null,
  };
}

export async function calculateAnalysis(papers) {
  const [raw] = await papers
    .aggregate(
      [
        {
          $project: {
            publicationDate: 1,
            type: 1,
            primaryTopic: 1,
            institutions: 1,
            citations: {
              $cond: [
                { $and: [{ $isNumber: "$citedByCount" }, { $gte: ["$citedByCount", 0] }] },
                "$citedByCount",
                null,
              ],
            },
            countries: {
              $setIntersection: [{ $ifNull: ["$institutions.country", []] }, ["US", "CA"]],
            },
          },
        },
        {
          $set: {
            affiliationGroup: {
              $switch: {
                branches: [
                  { case: { $eq: [{ $size: "$countries" }, 2] }, then: "collaboration" },
                  { case: { $in: ["US", "$countries"] }, then: "usOnly" },
                  { case: { $in: ["CA", "$countries"] }, then: "canadaOnly" },
                ],
                default: "unclassified",
              },
            },
          },
        },
        {
          $facet: {
            overview: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  earliest: { $min: "$publicationDate" },
                  latest: { $max: "$publicationDate" },
                },
              },
            ],
            monthly: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m", date: "$publicationDate", onNull: null },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
            types: groupCounts({ $ifNull: ["$type", "unknown"] }),
            topics: [
              {
                $group: {
                  _id: { $ifNull: ["$primaryTopic.id", null] },
                  name: { $max: "$primaryTopic.name" },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1, _id: 1 } },
            ],
            citationHistogram: [{ $group: { _id: "$citations", count: { $sum: 1 } } }],
            affiliations: groupCounts("$affiliationGroup"),
            countryMetrics: [
              {
                $group: {
                  _id: "$affiliationGroup",
                  count: { $sum: 1 },
                  citations: { $sum: "$citations" },
                  citationKnown: { $sum: { $cond: [{ $ne: ["$citations", null] }, 1, 0] } },
                  cited: { $sum: { $cond: [{ $gt: ["$citations", 0] }, 1, 0] } },
                  meanCitations: { $avg: "$citations" },
                },
              },
            ],
            countryMonths: [
              {
                $group: {
                  _id: {
                    group: "$affiliationGroup",
                    month: {
                      $dateToString: { format: "%Y-%m", date: "$publicationDate", onNull: null },
                    },
                  },
                  count: { $sum: 1 },
                },
              },
            ],
            universities: [
              { $unwind: "$institutions" },
              { $match: { "institutions.id": { $type: "string" } } },
              // One work contributes at most once to each institution.
              {
                $group: {
                  _id: { work: "$_id", university: "$institutions.id" },
                  name: { $max: "$institutions.name" },
                  citations: { $first: "$citations" },
                },
              },
              {
                $group: {
                  _id: "$_id.university",
                  name: { $max: "$name" },
                  count: { $sum: 1 },
                  meanCitations: { $avg: "$citations" },
                  citationKnown: { $sum: { $cond: [{ $ne: ["$citations", null] }, 1, 0] } },
                },
              },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 30 },
            ],
          },
        },
      ],
      { maxTimeMS: 90_000, allowDiskUse: true },
    )
    .toArray();

  const overview = raw.overview[0] ?? { total: 0, earliest: null, latest: null };
  delete overview._id;
  const months = raw.monthly
    .filter((row) => row._id !== null)
    .map((row) => ({ month: row._id, count: row.count }));
  // Fill only within observed publication-date bounds, never future months.
  if (months.length) {
    const counts = new Map(months.map((row) => [row.month, row.count]));
    const cursor = new Date(`${months[0].month}-01T00:00:00Z`);
    const end = months.at(-1).month;
    months.length = 0;
    while (cursor.toISOString().slice(0, 7) <= end) {
      const month = cursor.toISOString().slice(0, 7);
      months.push({ month, count: counts.get(month) ?? 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  const topics = raw.topics
    .filter((row) => row._id !== null)
    .slice(0, 8)
    .map((row) => ({ id: row._id, name: row.name || "Unnamed topic", count: row.count }));
  const heatTopics = topics.slice(0, 6);
  const topicMonths = heatTopics.length
    ? await papers
        .aggregate(
          [
            { $match: { "primaryTopic.id": { $in: heatTopics.map((topic) => topic.id) } } },
            {
              $group: {
                _id: {
                  topic: "$primaryTopic.id",
                  month: {
                    $dateToString: { format: "%Y-%m", date: "$publicationDate", onNull: null },
                  },
                },
                count: { $sum: 1 },
              },
            },
          ],
          { maxTimeMS: 30_000 },
        )
        .toArray()
    : [];
  const cells = new Map(topicMonths.map((row) => [`${row._id.topic}|${row._id.month}`, row.count]));
  const countryCells = new Map(
    raw.countryMonths.map((row) => [`${row._id.group}|${row._id.month}`, row.count]),
  );
  const countryGroups = ["usOnly", "canadaOnly", "collaboration", "unclassified"]
    .map((id) => {
      const row = raw.countryMetrics.find((group) => group._id === id);
      return {
        id,
        count: row?.count ?? 0,
        citations: row?.citations ?? 0,
        citationKnown: row?.citationKnown ?? 0,
        cited: row?.cited ?? 0,
        meanCitations: row?.meanCitations ?? null,
        undated: countryCells.get(`${id}|null`) ?? 0,
        months: months.map(({ month }) => ({
          month,
          count: countryCells.get(`${id}|${month}`) ?? 0,
        })),
      };
    })
    .filter((row) => row.id !== "unclassified" || row.count > 0);
  return {
    overview,
    monthly: months,
    publicationDateMissing: raw.monthly.find((row) => row._id === null)?.count ?? 0,
    types: raw.types.map((row) => ({ name: row._id, count: row.count })),
    topics,
    topicMissing: raw.topics.find((row) => row._id === null)?.count ?? 0,
    affiliations: raw.affiliations.map((row) => ({ name: row._id, count: row.count })),
    countryAnalysis: { groups: countryGroups },
    citations: citationStatistics(raw.citationHistogram),
    universities: raw.universities.map((row) => ({
      id: row._id,
      name: row.name,
      count: row.count,
      meanCitations: row.meanCitations,
      citationKnown: row.citationKnown,
    })),
    heatmap: heatTopics.map((topic) => ({
      ...topic,
      months: months.map(({ month }) => ({ month, count: cells.get(`${topic.id}|${month}`) ?? 0 })),
    })),
  };
}

export function createAnalysisCache(papers, snapshots) {
  return createWeeklyCache(snapshots, {
    id: "analysis-v2",
    calculate: () => calculateAnalysis(papers),
    label: "Analysis",
  });
}
