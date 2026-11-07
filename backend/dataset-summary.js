import { createWeeklyCache } from "./weekly-cache.js";

async function calculateSummary(papers) {
  const [summary] = await papers
    .aggregate(
      [
        {
          $set: {
            affiliationCountries: {
              $setIntersection: [{ $ifNull: ["$institutions.country", []] }, ["US", "CA"]],
            },
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$type", "unknown"] },
            count: { $sum: 1 },
            earliest: { $min: "$publicationDate" },
            latest: { $max: "$publicationDate" },
            usOnly: { $sum: { $cond: [{ $eq: ["$affiliationCountries", ["US"]] }, 1, 0] } },
            canadaOnly: { $sum: { $cond: [{ $eq: ["$affiliationCountries", ["CA"]] }, 1, 0] } },
            collaboration: {
              $sum: { $cond: [{ $eq: [{ $size: "$affiliationCountries" }, 2] }, 1, 0] },
            },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        {
          $group: {
            _id: null,
            total: { $sum: "$count" },
            earliest: { $min: "$earliest" },
            latest: { $max: "$latest" },
            types: { $push: { type: "$_id", count: "$count" } },
            usOnly: { $sum: "$usOnly" },
            canadaOnly: { $sum: "$canadaOnly" },
            collaboration: { $sum: "$collaboration" },
          },
        },
        {
          $project: {
            _id: 0,
            total: 1,
            earliest: 1,
            latest: 1,
            types: 1,
            affiliations: {
              usOnly: "$usOnly",
              canadaOnly: "$canadaOnly",
              collaboration: "$collaboration",
            },
          },
        },
      ],
      { maxTimeMS: 15_000 },
    )
    .toArray();
  return (
    summary ?? {
      total: 0,
      earliest: null,
      latest: null,
      types: [],
      affiliations: { usOnly: 0, canadaOnly: 0, collaboration: 0 },
    }
  );
}

export function createDatasetSummaryCache(papers, snapshots) {
  return createWeeklyCache(snapshots, {
    id: "dataset-summary-v1",
    calculate: () => calculateSummary(papers),
    label: "Dataset summary",
  });
}
