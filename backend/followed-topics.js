import express, { Router } from "express";
import {
  topicBody,
  topicError,
  TopicInputError,
  topicId,
  pageNumber,
  topicRevision,
} from "./topic-input.js";

export async function ensureFollowedTopicIndexes(followed, papers) {
  await followed.createIndexes([
    { key: { userId: 1, topicId: 1 }, unique: true, name: "followed_topics_owner_topic" },
    { key: { userId: 1, createdAt: -1, _id: -1 }, name: "followed_topics_owner_date" },
  ]);
  await papers.createIndex(
    { "primaryTopic.id": 1, publicationDate: -1, openAlexId: -1 },
    { name: "papers_primary_topic_recent" },
  );
}

function publicFollow(item) {
  if (!item) return null;
  const { topicId, note, lastCheckedAt, createdAt, updatedAt, revision } = item;
  return { topicId, note, lastCheckedAt, createdAt, updatedAt, revision };
}

export function recentPaperOptions(page) {
  return {
    projection: {
      _id: 0,
      openAlexId: 1,
      title: 1,
      publicationDate: 1,
      citedByCount: 1,
      institutions: 1,
      authors: { $slice: 4 },
      primaryTopic: 1,
    },
    sort: { publicationDate: -1, openAlexId: -1 },
    skip: (page - 1) * 20,
    limit: 21,
    maxTimeMS: 10000,
  };
}

export function createFollowedTopicRouter(followed, papers) {
  const router = Router();
  router.use(
    (req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      if (!req.user)
        return res.status(401).json({ error: "Sign in to manage your followed topics." });
      if (["POST", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json"))
        return res.status(415).json({ error: "Use an application/json request." });
      next();
    },
    express.json({ limit: "16kb" }),
  );

  async function named(items) {
    if (!items.length) return [];
    const names = await papers
      .aggregate(
        [
          { $match: { "primaryTopic.id": { $in: items.map((item) => item.topicId) } } },
          { $group: { _id: "$primaryTopic.id", name: { $max: "$primaryTopic.name" } } },
        ],
        { maxTimeMS: 10000 },
      )
      .toArray();
    const byId = new Map(names.map((row) => [row._id, row.name]));
    return items.map((item) => ({
      ...publicFollow(item),
      name: byId.get(item.topicId) || item.topicId,
    }));
  }
  router.get("/", async (req, res) => {
    const items = await followed
      .find({ userId: req.user._id }, { sort: { createdAt: -1, _id: -1 }, maxTimeMS: 10000 })
      .toArray();
    return res.json({ followedTopics: await named(items) });
  });
  router.get("/papers", async (req, res) => {
    const page = pageNumber(req.query.page);
    const id = req.query.topicId === undefined ? undefined : topicId(req.query.topicId);
    const items = await followed
      .find(
        { userId: req.user._id, ...(id ? { topicId: id } : {}) },
        { projection: { topicId: 1 }, maxTimeMS: 10000 },
      )
      .toArray();
    if (id && !items.length) return res.status(404).json({ error: "Followed topic not found." });
    const rows = items.length
      ? await papers
          .find(
            { "primaryTopic.id": { $in: items.map((item) => item.topicId) } },
            recentPaperOptions(page),
          )
          .toArray()
      : [];
    return res.json({ papers: rows.slice(0, 20), page, pageSize: 20, hasNext: rows.length > 20 });
  });
  router.post("/", async (req, res) => {
    topicBody(req.body, ["topicId"]);
    const id = topicId(req.body.topicId);
    const filter = { userId: req.user._id, topicId: id };
    const existing = await followed.findOne(filter);
    if (existing) return res.json({ followedTopic: (await named([existing]))[0] });
    if (
      !(await papers.findOne(
        { "primaryTopic.id": id },
        { projection: { _id: 1 }, maxTimeMS: 10000 },
      ))
    )
      return res.status(404).json({ error: "This primary topic is not available in the index." });
    const now = new Date();
    const item = {
      ...filter,
      note: "",
      lastCheckedAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    try {
      await followed.insertOne(item);
      return res.status(201).json({ followedTopic: (await named([item]))[0] });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const saved = await followed.findOne(filter);
      if (!saved)
        return res.status(409).json({ error: "Your followed topics changed. Please try again." });
      return res.json({ followedTopic: (await named([saved]))[0] });
    }
  });
  router.param("topicId", (req, _res, next, value) => {
    try {
      req.topicId = topicId(value);
      next();
    } catch (error) {
      next(error);
    }
  });
  async function changed(req, res) {
    const exists = await followed.findOne(
      { userId: req.user._id, topicId: req.topicId },
      { projection: { _id: 1 } },
    );
    return res.status(exists ? 409 : 404).json({
      error: exists
        ? "This followed topic changed. Reload before editing."
        : "Followed topic not found.",
    });
  }
  router.patch("/:topicId", async (req, res) => {
    topicBody(req.body, ["note", "revision"]);
    if (typeof req.body.note !== "string" || req.body.note.length > 2000)
      throw new TopicInputError("Notes must be text with at most 2,000 characters.");
    const item = await followed.findOneAndUpdate(
      { userId: req.user._id, topicId: req.topicId, revision: topicRevision(req.body.revision) },
      { $set: { note: req.body.note, updatedAt: new Date() }, $inc: { revision: 1 } },
      { returnDocument: "after" },
    );
    if (!item) return changed(req, res);
    return res.json({ followedTopic: (await named([item]))[0] });
  });
  router.post("/:topicId/check", async (req, res) => {
    topicBody(req.body, []);
    const now = new Date();
    const item = await followed.findOneAndUpdate(
      { userId: req.user._id, topicId: req.topicId },
      { $max: { lastCheckedAt: now, updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!item) return res.status(404).json({ error: "Followed topic not found." });
    return res.json({ followedTopic: (await named([item]))[0] });
  });
  router.delete("/:topicId", async (req, res) => {
    topicBody(req.body, ["revision"]);
    const result = await followed.deleteOne({
      userId: req.user._id,
      topicId: req.topicId,
      revision: topicRevision(req.body.revision),
    });
    if (!result.deletedCount) return changed(req, res);
    return res.json({ removed: true });
  });
  router.use(topicError);
  return router;
}
