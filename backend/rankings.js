import { createWeeklyCache } from "./weekly-cache.js";

const limit = 100;

export function rankRows(rows, metric) {
  const sorted = [...rows].sort(
    (a, b) => b[metric] - a[metric] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row[metric] !== sorted[index - 1][metric]) rank = index + 1;
    return { ...row, rank };
  });
}

// Converting to an object collapses repeated IDs within one work before unwinding.
// IDs identify people/institutions; a shared display name never merges identities.
function identities(field, pattern) {
  return {
    $objectToArray: {
      $arrayToObject: {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: [field, []] },
              as: "entity",
              cond: {
                $regexMatch: { input: { $ifNull: ["$$entity.id", ""] }, regex: pattern },
              },
            },
          },
          as: "entity",
          in: { k: "$$entity.id", v: "$$entity.name" },
        },
      },
    },
  };
}

function entityBoards(identityExpression, includeMean = false) {
  return [
    { $project: { citations: 1, entities: identityExpression } },
    { $unwind: "$entities" },
    {
      $group: {
        _id: "$entities.k",
        name: { $max: "$entities.v" },
        papers: { $sum: 1 },
        citations: { $sum: "$citations" },
        citationKnown: { $sum: { $cond: [{ $ne: ["$citations", null] }, 1, 0] } },
      },
    },
    {
      $set: {
        citationScore: { $cond: [{ $gt: ["$citationKnown", 0] }, "$citations", -1] },
        meanScore: {
          $cond: [
            { $gt: ["$citationKnown", 0] },
            { $divide: ["$citations", "$citationKnown"] },
            -1,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        byCitations: {
          $topN: { n: limit, sortBy: { citationScore: -1, _id: 1 }, output: "$$ROOT" },
        },
        byPapers: { $topN: { n: limit, sortBy: { papers: -1, _id: 1 }, output: "$$ROOT" } },
        ...(includeMean
          ? {
              byMeanCitations: {
                $topN: { n: limit, sortBy: { meanScore: -1, _id: 1 }, output: "$$ROOT" },
              },
            }
          : {}),
      },
    },
  ];
}

function normaliseBoards(raw, includeMean = false) {
  const boards = raw[0] ?? { byCitations: [], byPapers: [] };
  const normalise = (rows) =>
    rows.map(({ _id, name, papers, citations, citationKnown }) => ({
      id: _id,
      name: name || _id.split("/").at(-1),
      papers,
      citations,
      citationKnown,
      meanCitations: citationKnown ? citations / citationKnown : null,
    }));
  return {
    byCitations: rankRows(
      normalise(boards.byCitations.filter((row) => row.citationKnown > 0)),
      "citations",
    ),
    byPapers: rankRows(normalise(boards.byPapers), "papers"),
    ...(includeMean
      ? {
          byMeanCitations: rankRows(
            normalise((boards.byMeanCitations ?? []).filter((row) => row.citationKnown > 0)),
            "meanCitations",
          ),
        }
      : {}),
  };
}

export async function calculateRankings(papers) {
  const [paperRows, [raw]] = await Promise.all([
    papers
      .find(
        { citedByCount: { $type: "number", $gte: 0 } },
        {
          projection: {
            _id: 0,
            openAlexId: 1,
            title: 1,
            publicationDate: 1,
            citedByCount: 1,
            authors: { $slice: 4 },
            institutions: 1,
          },
          sort: { citedByCount: -1, openAlexId: 1 },
          limit,
          maxTimeMS: 15_000,
        },
      )
      .toArray(),
    papers
      .aggregate(
        [
          {
            $project: {
              publicationDate: 1,
              authors: 1,
              institutions: 1,
              primaryTopic: 1,
              citations: {
                $cond: [
                  { $and: [{ $isNumber: "$citedByCount" }, { $gte: ["$citedByCount", 0] }] },
                  "$citedByCount",
                  null,
                ],
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
              universities: entityBoards(
                identities("$institutions", "^https://openalex\\.org/I[1-9][0-9]*$"),
                true,
              ),
              authors: entityBoards(
                identities("$authors", "^https://openalex\\.org/A[1-9][0-9]*$"),
              ),
              topics: entityBoards({
                $cond: [
                  { $ne: [{ $ifNull: ["$primaryTopic.id", null] }, null] },
                  [{ k: "$primaryTopic.id", v: "$primaryTopic.name" }],
                  [],
                ],
              }),
            },
          },
        ],
        { maxTimeMS: 120_000, allowDiskUse: true },
      )
      .toArray(),
  ]);
  const overview = raw.overview[0] ?? { total: 0, earliest: null, latest: null };
  delete overview._id;
  return {
    overview,
    limit,
    papers: rankRows(
      paperRows.map((paper) => ({ ...paper, id: paper.openAlexId })),
      "citedByCount",
    ),
    universities: normaliseBoards(raw.universities, true),
    authors: normaliseBoards(raw.authors),
    topics: normaliseBoards(raw.topics),
  };
}

export function createRankingsCache(papers, snapshots) {
  return createWeeklyCache(snapshots, {
    id: "rankings-v2",
    calculate: () => calculateRankings(papers),
    label: "Rankings",
  });
}
