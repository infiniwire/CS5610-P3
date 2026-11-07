import { Router } from "express";

const pageSize = 20;
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

export function parsePaperQuery({
  institution,
  month,
  subject,
  author,
  topic,
  sort = "citations_desc",
  page = "1",
}) {
  const filter = {};

  for (const [name, value, field] of [
    ["subject", subject, "title"],
    ["author", author, "authors.name"],
    ["topic", topic],
  ]) {
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 120) {
      throw new Error(`${name} must be text with at most 120 characters.`);
    }
    const term = value.trim();
    if (!term) continue;
    // Treat user input as literal text, never as a regular expression.
    const expression = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (field) filter[field] = expression;
    else filter.$or = [{ "primaryTopic.name": expression }, { "topics.name": expression }];
  }

  if (institution !== undefined) {
    const id =
      typeof institution === "string"
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
  if (
    typeof page !== "string" ||
    !/^[1-9]\d*$/.test(page) ||
    !Number.isSafeInteger(Number(page) * pageSize)
  ) {
    throw new Error("page must be a positive integer.");
  }

  return { filter, direction, page: Number(page) };
}

export function createPaperRouter(papers, summaryCache) {
  const router = Router();
  let institutionOptions;

  router.get("/", async (req, res) => {
    let query;
    try {
      query = parsePaperQuery(req.query);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const { filter, direction, page } = query;
    try {
      const results = await papers
        .find(filter, {
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
        })
        .toArray();

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
      institutionOptions ??= papers
        .aggregate(
          [
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
          ],
          { maxTimeMS: 15_000 },
        )
        .toArray();
      return res.json({ institutions: await institutionOptions });
    } catch (error) {
      institutionOptions = undefined;
      console.error(`University query failed (${error.name}).`);
      return res.status(500).json({ error: "Could not load universities." });
    }
  });

  router.get("/summary", async (_req, res) => {
    try {
      const summary = await summaryCache.get();
      const maxAge = Math.max(
        0,
        Math.floor((new Date(summary.nextRefreshAt).getTime() - Date.now()) / 1000),
      );
      res.set("Cache-Control", `public, max-age=${maxAge}`);
      return res.json(summary);
    } catch (error) {
      console.error(`Dataset summary failed (${error.name}).`);
      return res.status(500).json({ error: "Could not load the dataset summary." });
    }
  });

  router.get("/:workId", async (req, res) => {
    if (!/^W[1-9]\d*$/.test(req.params.workId)) {
      return res.status(400).json({ error: "Invalid OpenAlex work ID." });
    }

    try {
      const paper = await papers.findOne(
        {
          openAlexId: `https://openalex.org/${req.params.workId}`,
        },
        {
          projection: {
            _id: 0,
            openAlexId: 1,
            title: 1,
            doi: 1,
            authors: 1,
            institutions: 1,
            publicationDate: 1,
            type: 1,
            citedByCount: 1,
            primaryTopic: 1,
            topics: 1,
            sourceUrl: 1,
            source: 1,
            isRetracted: 1,
            syncedAt: 1,
          },
          maxTimeMS: 10_000,
        },
      );
      if (!paper) return res.status(404).json({ error: "Paper not found." });
      return res.json({ paper });
    } catch (error) {
      console.error(`Paper detail query failed (${error.name}).`);
      return res.status(500).json({ error: "Could not load paper details." });
    }
  });

  return router;
}
