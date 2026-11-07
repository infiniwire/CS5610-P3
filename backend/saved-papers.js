import express, { Router } from "express";

const pageSize = 20;
class InputError extends Error {}
const statuses = new Set(["unread", "reading", "read"]);
const paperProjection = {
  _id: 0,
  openAlexId: 1,
  title: 1,
  publicationDate: 1,
  citedByCount: 1,
  institutions: 1,
  authors: { $slice: 4 },
};

function workId(value) {
  const match =
    typeof value === "string" && value.match(/^(?:https:\/\/openalex\.org\/)?(W[1-9]\d{0,19})$/);
  if (!match) throw new InputError("Use a valid OpenAlex work ID.");
  return `https://openalex.org/${match[1]}`;
}

function validateBody(body, allowed) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  ) {
    throw new InputError("The request contains unsupported fields.");
  }
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new InputError("A valid saved-paper revision is required. Reload and try again.");
  return value;
}

function publicSaved(item) {
  if (!item) return null;
  const { _id, openAlexId, notes, readingStatus, createdAt, updatedAt, revision } = item;
  return {
    id: _id.toHexString(),
    openAlexId,
    notes,
    readingStatus,
    createdAt,
    updatedAt,
    revision,
  };
}

export async function ensureSavedPaperIndexes(savedPapers) {
  await savedPapers.createIndexes([
    { key: { userId: 1, openAlexId: 1 }, unique: true, name: "saved_papers_owner_work" },
    { key: { userId: 1, createdAt: -1, _id: -1 }, name: "saved_papers_owner_date" },
    {
      key: { userId: 1, readingStatus: 1, createdAt: -1, _id: -1 },
      name: "saved_papers_owner_status",
    },
  ]);
}

export function createSavedPaperRouter(savedPapers, papers) {
  const router = Router();
  router.use(
    (req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      if (!req.user) return res.status(401).json({ error: "Sign in to manage your saved papers." });
      if (["POST", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json")) {
        return res.status(415).json({ error: "Use an application/json request." });
      }
      next();
    },
    express.json({ limit: "64kb" }),
  );

  router.get("/", async (req, res) => {
    const { page = "1", status } = req.query;
    if (
      typeof page !== "string" ||
      !/^[1-9]\d{0,5}$/.test(page) ||
      (status !== undefined && !statuses.has(status))
    ) {
      return res.status(400).json({ error: "Use a valid page and reading status." });
    }
    const filter = { userId: req.user._id, ...(status ? { readingStatus: status } : {}) };
    const [items, total] = await Promise.all([
      savedPapers
        .find(filter, {
          sort: { createdAt: -1, _id: -1 },
          skip: (Number(page) - 1) * pageSize,
          limit: pageSize,
          maxTimeMS: 10000,
        })
        .toArray(),
      savedPapers.countDocuments(filter, { maxTimeMS: 10000 }),
    ]);
    const works = items.length
      ? await papers
          .find(
            { openAlexId: { $in: items.map((item) => item.openAlexId) } },
            { projection: paperProjection, maxTimeMS: 10000 },
          )
          .toArray()
      : [];
    const byId = new Map(works.map((paper) => [paper.openAlexId, paper]));
    return res.json({
      savedPapers: items.map((item) => ({
        ...publicSaved(item),
        paper: byId.get(item.openAlexId) ?? null,
      })),
      page: Number(page),
      pageSize,
      total,
      hasNext: Number(page) * pageSize < total,
    });
  });

  router.param("workId", (req, _res, next, value) => {
    try {
      req.openAlexId = workId(value);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/:workId", async (req, res) => {
    const item = await savedPapers.findOne({ userId: req.user._id, openAlexId: req.openAlexId });
    return res.json({ savedPaper: publicSaved(item) });
  });

  router.post("/", async (req, res) => {
    validateBody(req.body, ["openAlexId"]);
    const openAlexId = workId(req.body.openAlexId);
    const filter = { userId: req.user._id, openAlexId };
    const existing = await savedPapers.findOne(filter);
    if (existing) return res.json({ savedPaper: publicSaved(existing) });
    const paper = await papers.findOne({ openAlexId }, { projection: { _id: 1 } });
    if (!paper) return res.status(404).json({ error: "This paper is not available in the index." });
    const now = new Date();
    const item = {
      ...filter,
      notes: "",
      readingStatus: "unread",
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const { insertedId } = await savedPapers.insertOne(item);
      return res.status(201).json({ savedPaper: publicSaved({ ...item, _id: insertedId }) });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const saved = await savedPapers.findOne(filter);
      if (!saved)
        return res.status(409).json({ error: "Your saved papers changed. Please try again." });
      return res.json({ savedPaper: publicSaved(saved) });
    }
  });

  async function missingOrChanged(req, res) {
    const exists = await savedPapers.findOne(
      { userId: req.user._id, openAlexId: req.openAlexId },
      { projection: { _id: 1 } },
    );
    return res.status(exists ? 409 : 404).json({
      error: exists
        ? "This saved paper changed in another window. Reload it before editing."
        : "Saved paper not found.",
    });
  }

  router.patch("/:workId", async (req, res) => {
    validateBody(req.body, ["notes", "readingStatus", "revision"]);
    const changes = {};
    if (Object.hasOwn(req.body, "notes")) {
      if (typeof req.body.notes !== "string" || req.body.notes.length > 10000)
        throw new InputError("Notes must be text with at most 10,000 characters.");
      changes.notes = req.body.notes;
    }
    if (Object.hasOwn(req.body, "readingStatus")) {
      if (!statuses.has(req.body.readingStatus))
        throw new InputError("Choose unread, reading, or read.");
      changes.readingStatus = req.body.readingStatus;
    }
    if (!Object.keys(changes).length)
      throw new InputError("Provide notes or a reading status to update.");
    const item = await savedPapers.findOneAndUpdate(
      { userId: req.user._id, openAlexId: req.openAlexId, revision: revision(req.body.revision) },
      { $set: { ...changes, updatedAt: new Date() }, $inc: { revision: 1 } },
      { returnDocument: "after" },
    );
    if (!item) return missingOrChanged(req, res);
    return res.json({ savedPaper: publicSaved(item) });
  });

  router.delete("/:workId", async (req, res) => {
    validateBody(req.body, ["revision"]);
    const result = await savedPapers.deleteOne({
      userId: req.user._id,
      openAlexId: req.openAlexId,
      revision: revision(req.body.revision),
    });
    if (!result.deletedCount) return missingOrChanged(req, res);
    return res.json({ removed: true });
  });

  router.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON request." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Request is too large." });
    if (error instanceof InputError) return res.status(400).json({ error: error.message });
    console.error(`Saved paper request failed (${error.name}).`);
    return res
      .status(500)
      .json({ error: "Could not complete the saved paper request. Please try again." });
  });
  return router;
}
