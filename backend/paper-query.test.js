import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePaperQuery } from "./papers.js";

test("search combines all fields with university/month filters and pagination", () => {
  const { filter, page, direction } = parsePaperQuery({
    subject: "  neural networks ",
    author: "Zhao",
    topic: "language",
    institution: "I58610484",
    month: "2026-05",
    page: "2",
    sort: "citations_asc",
  });
  assert.equal(filter.title.$regex, "neural networks");
  assert.equal(filter["authors.name"].$regex, "Zhao");
  assert.equal(filter.title.$options, "i");
  assert.deepEqual(filter.$or, [
    { "primaryTopic.name": { $regex: "language", $options: "i" } },
    { "topics.name": { $regex: "language", $options: "i" } },
  ]);
  assert.equal(filter["institutions.id"], "https://openalex.org/I58610484");
  assert.equal(filter.publicationDate.$gte.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(page, 2);
  assert.equal(direction, 1);
});

test("search treats punctuation and regex patterns as literal text", () => {
  const term = "C++ (AI) [v2].*? $^|{x}\\";
  const { filter } = parsePaperQuery({ subject: term });
  const regex = new RegExp(filter.title.$regex, "i");
  assert(regex.test(`About ${term.toLowerCase()} today`));
  assert(!regex.test("C AI v2"));
});

test("blank search preserves browsing and rejects operator objects, repeated fields, and long inputs", () => {
  assert.deepEqual(parsePaperQuery({ subject: "  ", author: "", topic: " " }).filter, {});
  for (const field of ["subject", "author", "topic"]) {
    for (const value of [{ $ne: "" }, ["one", "two"], "x".repeat(121)]) {
      assert.throws(() => parsePaperQuery({ [field]: value }), /at most 120/);
    }
  }
});
