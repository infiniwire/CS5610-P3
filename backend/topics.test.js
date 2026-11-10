import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { topicId, pageNumber, monthRange, topicBody } from "./topic-input.js";
import { recentPaperOptions } from "./followed-topics.js";
import { createTopicCaches, universityCacheKey } from "./topics.js";

test("topic identity normalizes IDs and rejects operators and repeated values", () => {
  assert.equal(topicId("T123"), "https://openalex.org/T123");
  assert.equal(topicId("https://openalex.org/T123"), topicId("T123"));
  for (const value of [null, ["T1"], { $ne: "" }, "T0", "I1", "T1/extra", "https://evil.org/T1"])
    assert.throws(() => topicId(value));
  for (const value of ["0", "-1", "1.5", ["1", "2"], { $gt: 0 }, "1000000"])
    assert.throws(() => pageNumber(value));
  assert.equal(pageNumber(undefined), 1);
  assert.equal(pageNumber("2"), 2);
  assert.throws(() => topicBody({ userId: "forged" }, ["topicId"]));
  assert.throws(() => topicBody([], []));
});

test("month ranges are UTC half-open boundaries including December rollover and leap years", () => {
  assert.deepEqual(monthRange("2026-12"), {
    $gte: new Date("2026-12-01"),
    $lt: new Date("2027-01-01"),
  });
  assert.deepEqual(monthRange("2024-02"), {
    $gte: new Date("2024-02-01"),
    $lt: new Date("2024-03-01"),
  });
  for (const value of ["2026-13", "2026-1", ["2026-01"], { $ne: null }, undefined])
    assert.throws(() => monthRange(value));
  assert.deepEqual(recentPaperOptions(2).sort, { publicationDate: -1, openAlexId: -1 });
  assert.equal(recentPaperOptions(2).skip, 20);
  assert.equal(recentPaperOptions(2).limit, 21);
});

test("public comparison caches separate every normalized topic/month and refresh weekly", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-01") });
  const stored = new Map();
  const filters = [];
  const papers = {
    aggregate(pipeline) {
      filters.push(pipeline[0].$match);
      return { toArray: async () => [] };
    },
  };
  const snapshots = {
    async findOne({ _id }) {
      return stored.get(_id);
    },
    async updateOne({ _id }, update) {
      stored.set(_id, structuredClone(update.$set));
    },
  };
  const caches = createTopicCaches(papers, snapshots);
  t.after(() => caches.stop());
  assert.equal(universityCacheKey("T1", "2026-01"), universityCacheKey(topicId("T1"), "2026-01"));
  await Promise.all([caches.universities("T1", "2026-01"), caches.universities("T1", "2026-01")]);
  assert.equal(filters.length, 1);
  await caches.universities("T2", "2026-01");
  await caches.universities("T1", "2026-02");
  assert.equal(filters.length, 3);
  assert.equal(stored.size, 3);
  assert.equal(filters[0]["primaryTopic.id"], topicId("T1"));
  assert.equal(filters[0].publicationDate.$lt.toISOString(), "2026-02-01T00:00:00.000Z");
  t.mock.timers.tick(7 * 24 * 60 * 60 * 1000);
  await setImmediate();
  assert.equal(filters.length, 6);
  const restart = createTopicCaches(papers, snapshots);
  t.after(() => restart.stop());
  await restart.universities("T1", "2026-01");
  assert.equal(filters.length, 6);
});
