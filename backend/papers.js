import { Router } from "express";

const pageSize = 20;
const summaryCacheMs = 5 * 60 * 1000;
const citationSorts = new Map([
  ["citations_desc", -1],
  ["citations_asc", 1],
]);

export async function ensurePaperIndexes(papers) {
  await papers.createIndexes([
    {
      key: { citedByCount: -1, openAlexId: -1, publicationDate: 1 },
      name: "papers_citations",
    },
    {
      key: {
        "institutions.id": 1,
        citedByCount: -1,
        openAlexId: -1,
        publicationDate: 1,
      },
      name: "papers_institution_citations",
    },
  ]);
}

function parseQuery({ institution, month, sort = "citations_desc", page = "1" }) {
  const filter = {};

  if (institution !== undefined) {
    const id = typeof institution === "string"
      ? institution.match(/^(?:https:\/\/openalex\.org\/)?(I[1-9]\d*)$/)?.[1]
      : undefined;
    if (!id) throw new Error("institution must be an OpenAlex institution ID.");
    filter["institutions.id"] = `https://openalex.org/${id}`;
  }

  if (month !== undefined) {
    if (typeof month !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error("month must use YYYY-MM format.");
    }
    const [year, number] = month.split("-").map(Number);
    filter.publicationDate = {
      $gte: new Date(Date.UTC(year, number - 1, 1)),
      $lt: new Date(Date.UTC(year, number, 1)),
    };
  }

  const direction = citationSorts.get(sort);
  if (!direction) throw new Error("sort must be citations_desc or citations_asc.");
  if (typeof page !== "string" || !/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page) * pageSize)) {
    throw new Error("page must be a positive integer.");
  }

  return { filter, direction, page: Number(page) };
}

export function createPaperRouter(papers) {
  const router = Router();
  let institutionOptions;
  let datasetSummary;
  let summaryExpiresAt = 0;

  router.get("/", async (req, res) => {
    let query;
    try {
      query = parseQuery(req.query);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const { filter, direction, page } = query;
    try {
      const results = await papers.find(filter, {
        projection: {
          _id: 0,
          openAlexId: 1,
          title: 1,
          publicationDate: 1,
          citedByCount: 1,
          institutions: 1,
          authors: { $slice: 4 },
        },
        sort: { citedByCount: direction, openAlexId: direction },
        skip: (page - 1) * pageSize,
        limit: pageSize + 1,
        maxTimeMS: 10_000,
      }).toArray();

      return res.json({
        papers: results.slice(0, pageSize),
        page,
        pageSize,
        hasNext: results.length > pageSize,
      });
    } catch (error) {
      console.error(`Paper query failed (${error.name}).`);
      return res.status(500).json({ error: "Could not load papers." });
    }
  });

  router.get("/institutions", async (_req, res) => {
    try {
      institutionOptions ??= papers.aggregate([
        { $project: { institutions: 1, _id: 0 } },
        { $unwind: "$institutions" },
        {
          $group: {
            _id: "$institutions.id",
            name: { $max: "$institutions.name" },
            country: { $first: "$institutions.country" },
          },
        },
        { $match: { _id: { $type: "string" }, name: { $type: "string" } } },
        { $sort: { name: 1, _id: 1 } },
        { $project: { _id: 0, id: "$_id", name: 1, country: 1 } },
      ], { maxTimeMS: 15_000 }).toArray();
      return res.json({ institutions: await institutionOptions });
    } catch (error) {
      institutionOptions = undefined;
      console.error(`University query failed (${error.name}).`);
      return res.status(500).json({ error: "Could not load universities." });
    }
  });

  router.get("/summary", async (_req, res) => {
    try {
      if (!datasetSummary || Date.now() >= summaryExpiresAt) {
        summaryExpiresAt = Infinity;
        datasetSummary = papers.aggregate([
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
              collaboration: { $sum: { $cond: [{ $eq: [{ $size: "$affiliationCountries" }, 2] }, 1, 0] } },
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
        ], { maxTimeMS: 15_000 }).toArray()
          .then(([summary]) => {
            summaryExpiresAt = Date.now() + summaryCacheMs;
            return {
              ...(summary ?? {
                total: 0,
                earliest: null,
                latest: null,
                types: [],
                affiliations: { usOnly: 0, canadaOnly: 0, collaboration: 0 },
              }),
              calculatedAt: new Date(),
            };
          })
          .catch((error) => {
            datasetSummary = undefined;
            throw error;
          });
      }
      return res.json(await datasetSummary);
    } catch (error) {
      console.error(`Dataset summary failed (${error.name}).`);
      return res.status(500).json({ error: "Could not load the dataset summary." });
    }
  });

  return router;
}
