import { Router } from "express";
import { createWeeklyCache } from "./weekly-cache.js";
import { monthRange, pageNumber, topicError, TopicInputError, topicId } from "./topic-input.js";
import { rankRows } from "./rankings.js";

export async function calculateTopicDirectory(papers) {
  const topics = await papers
    .aggregate(
      [
        { $match: { "primaryTopic.id": { $regex: "^https://openalex\\.org/T[1-9][0-9]{0,19}$" } } },
        {
          $group: {
            _id: "$primaryTopic.id",
            name: { $max: "$primaryTopic.name" },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, id: "$_id", name: { $ifNull: ["$name", "$_id"] }, count: 1 } },
        { $sort: { name: 1, id: 1 } },
      ],
      { maxTimeMS: 30000, allowDiskUse: true },
    )
    .toArray();
  return { topics };
}

export async function calculateTopicUniversities(papers, id, month) {
  const rows = await papers
    .aggregate(
      [
        { $match: { "primaryTopic.id": topicId(id), publicationDate: monthRange(month) } },
        { $unwind: "$institutions" },
        { $match: { "institutions.id": { $regex: "^https://openalex\\.org/I[1-9][0-9]*$" } } },
        {
          $group: {
            _id: { work: "$_id", university: "$institutions.id" },
            name: { $max: "$institutions.name" },
          },
        },
        { $group: { _id: "$_id.university", name: { $max: "$name" }, papers: { $sum: 1 } } },
        { $project: { _id: 0, id: "$_id", name: { $ifNull: ["$name", "$_id"] }, papers: 1 } },
      ],
      { maxTimeMS: 30000, allowDiskUse: true },
    )
    .toArray();
  return { topicId: topicId(id), month, universities: rankRows(rows, "papers") };
}

export function universityCacheKey(id, month) {
  monthRange(month);
  return `topic-universities-v1:${topicId(id)}:${month}`;
}

export function createTopicCaches(papers, snapshots) {
  const directory = createWeeklyCache(snapshots, {
    id: "topic-directory-v1",
    calculate: () => calculateTopicDirectory(papers),
    label: "Topic directory",
  });
  const comparisons = new Map();
  return {
    directory,
    universities(id, month) {
      const key = universityCacheKey(id, month);
      let cache = comparisons.get(key);
      if (!cache) {
        // Bound per-process timers/memory; evicted snapshots remain persisted in MongoDB.
        if (comparisons.size >= 64) {
          const oldest = comparisons.keys().next().value;
          comparisons.get(oldest).stop();
          comparisons.delete(oldest);
        }
        cache = createWeeklyCache(snapshots, {
          id: key,
          calculate: () => calculateTopicUniversities(papers, id, month),
          label: "Topic universities",
        });
      }
      comparisons.delete(key);
      comparisons.set(key, cache);
      return cache.get();
    },
    start: () => directory.start(),
    stop() {
      directory.stop();
      for (const cache of comparisons.values()) cache.stop();
    },
  };
}

function sendPublic(res, data) {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(data.nextRefreshAt).getTime() - Date.now()) / 1000),
  );
  return res.set("Cache-Control", `public, max-age=${maxAge}`).json(data);
}

export function createTopicRouter(caches) {
  const router = Router();
  router.get("/", async (req, res) => {
    const { q = "" } = req.query;
    const page = pageNumber(req.query.page);
    if (typeof q !== "string" || q.length > 120)
      throw new TopicInputError("Search using at most 120 characters.");
    const data = await caches.directory.get();
    const term = q.trim().toLowerCase();
    const rows = data.topics.filter(
      (row) => row.name.toLowerCase().includes(term) || row.id.toLowerCase().includes(term),
    );
    return sendPublic(res, {
      topics: rows.slice((page - 1) * 20, page * 20),
      page,
      pageSize: 20,
      total: rows.length,
      hasNext: page * 20 < rows.length,
      calculatedAt: data.calculatedAt,
      nextRefreshAt: data.nextRefreshAt,
    });
  });
  router.get("/:topicId/universities", async (req, res) => {
    const id = topicId(req.params.topicId);
    const { month } = req.query;
    monthRange(month);
    return sendPublic(res, await caches.universities(id, month));
  });
  router.use(topicError);
  return router;
}
