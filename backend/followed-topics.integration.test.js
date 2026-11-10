import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { MongoClient } from "mongodb";
import { configureAuth } from "./auth.js";
import { createFollowedTopicRouter, ensureFollowedTopicIndexes } from "./followed-topics.js";
import {
  calculateTopicDirectory,
  calculateTopicUniversities,
  createTopicCaches,
  createTopicRouter,
} from "./topics.js";

const uri = process.env.TOPIC_TEST_MONGODB_URI ?? process.env.MONGODB_URI;
const id = (value) => `https://openalex.org/${value}`;
test(
  "research category tracker with isolated MongoDB and real Passport sessions",
  { skip: !uri, timeout: 60000 },
  async (t) => {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    const dbName = `paperpulse_topics_test_${randomBytes(8).toString("hex")}`;
    const db = client.db(dbName);
    let server;
    let caches;
    try {
      await client.connect();
      const papers = db.collection("papers");
      const followed = db.collection("followedTopics");
      const university = { id: id("I1"), name: "University One", country: "US" };
      await papers.insertMany(
        Array.from({ length: 45 }, (_, index) => ({
          openAlexId: id(`W${index + 1}`),
          title: `Research ${index + 1}`,
          publicationDate: new Date(index < 42 ? "2026-02-01" : "2026-03-01"),
          citedByCount: 0,
          authors: [],
          institutions:
            index === 0
              ? [university, university, { id: id("I2"), name: "University Two", country: "CA" }]
              : [university],
          primaryTopic: {
            id: id(index < 44 ? "T1" : "T2"),
            name: index < 44 ? "Machine learning" : "Language",
          },
          topics: [{ id: id("T3"), name: "Secondary only" }],
        })),
      );
      await ensureFollowedTopicIndexes(followed, papers);
      const app = express();
      app.locals.db = db;
      await configureAuth(app, client, "topic-integration-test-secret".repeat(2));
      caches = createTopicCaches(papers, db.collection("appCache"));
      app.use("/api/topics", createTopicRouter(caches));
      app.use("/api/followed-topics", createFollowedTopicRouter(followed, papers));
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const base = `http://127.0.0.1:${server.address().port}`;
      async function request(
        path,
        { method = "GET", body, cookie, raw, type = "application/json" } = {},
      ) {
        const response = await fetch(`${base}/api/${path}`, {
          method,
          headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body !== undefined || raw !== undefined ? { "Content-Type": type } : {}),
          },
          body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        });
        return {
          status: response.status,
          body: await response.json(),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
          cache: response.headers.get("cache-control"),
        };
      }
      const alice = await request("auth/register", {
        method: "POST",
        body: { email: "alice@topics.invalid", password: "test-password" },
      });
      const bob = await request("auth/register", {
        method: "POST",
        body: { email: "bob@topics.invalid", password: "test-password" },
      });
      assert.equal(alice.status, 201);
      assert.equal(bob.status, 201);
      const api = (suffix = "", options = {}) =>
        request(`followed-topics${suffix}`, { cookie: alice.cookie, ...options });

      await t.test(
        "every personal route requires authentication and disables shared caching",
        async () => {
          for (const [method, suffix] of [
            ["GET", ""],
            ["GET", "/papers"],
            ["POST", ""],
            ["PATCH", "/T1"],
            ["DELETE", "/T1"],
            ["POST", "/T1/check"],
          ]) {
            const result = await request(`followed-topics${suffix}`, {
              method,
              ...(method === "GET" ? {} : { body: {} }),
            });
            assert.equal(result.status, 401);
            assert.equal(result.cache, "private, no-store");
          }
        },
      );
      await t.test(
        "only actual primary topics can be followed; forged ownership is rejected",
        async () => {
          for (const topicId of ["T999", "T3"])
            assert.equal((await api("", { method: "POST", body: { topicId } })).status, 404);
          for (const body of [
            { topicId: { $ne: null } },
            { topicId: "T1", userId: bob.body.user.id },
            [],
          ])
            assert.equal((await api("", { method: "POST", body })).status, 400);
          const directory = await calculateTopicDirectory(papers);
          assert.deepEqual(directory.topics.map((row) => row.id).sort(), [id("T1"), id("T2")]);
          const search = await request("topics?q=machine");
          assert.equal(search.body.topics.length, 1);
          assert.match(search.cache, /^public/);
          assert.equal((await request("topics?q=a&q=b")).status, 400);
        },
      );
      await t.test(
        "concurrent follows normalize identities and cannot create duplicates",
        async () => {
          const results = await Promise.all([
            api("", { method: "POST", body: { topicId: "T1" } }),
            api("", { method: "POST", body: { topicId: id("T1") } }),
          ]);
          assert.deepEqual(results.map((row) => row.status).sort(), [200, 201]);
          assert.equal(await followed.countDocuments({ userId: { $exists: true } }), 1);
          const item = (await api()).body.followedTopics[0];
          assert.equal(item.topicId, id("T1"));
          assert.equal(item.lastCheckedAt, null);
          assert.equal(item.userId, undefined);
          assert.equal(item.name, "Machine learning");
          assert.equal(item.revision, 0);
        },
      );
      await t.test(
        "two users cannot list, stream, edit, check or delete each other's follows",
        async () => {
          assert.deepEqual((await api("", { cookie: bob.cookie })).body.followedTopics, []);
          assert.deepEqual((await api("/papers", { cookie: bob.cookie })).body.papers, []);
          assert.equal((await api("/papers?topicId=T1", { cookie: bob.cookie })).status, 404);
          for (const [method, suffix, body] of [
            ["PATCH", "/T1", { note: "forged", revision: 0 }],
            ["DELETE", "/T1", { revision: 0 }],
            ["POST", "/T1/check", {}],
          ])
            assert.equal((await api(suffix, { cookie: bob.cookie, method, body })).status, 404);
          assert.equal(
            (await api("", { cookie: bob.cookie, method: "POST", body: { topicId: "T1" } })).status,
            201,
          );
        },
      );
      await t.test(
        "notes use revisions; checking uses server time and preserves the note",
        async () => {
          const edits = await Promise.all(
            ["First", "Second"].map((note) =>
              api("/T1", { method: "PATCH", body: { revision: 0, note } }),
            ),
          );
          assert.deepEqual(edits.map((row) => row.status).sort(), [200, 409]);
          const note = edits.find((row) => row.status === 200).body.followedTopic.note;
          assert.equal(
            (await api("/T1/check", { method: "POST", body: { lastCheckedAt: "2000-01-01" } }))
              .status,
            400,
          );
          assert.equal(
            (
              await api("/T1", {
                method: "PATCH",
                body: { revision: 1, note, lastCheckedAt: "2000-01-01" },
              })
            ).status,
            400,
          );
          const before = Date.now();
          const checked = await api("/T1/check", { method: "POST", body: {} });
          assert.equal(checked.status, 200);
          assert.equal(checked.body.followedTopic.note, note);
          assert(Date.parse(checked.body.followedTopic.lastCheckedAt) >= before);
          assert(Date.parse(checked.body.followedTopic.lastCheckedAt) <= Date.now());
          assert.equal((await api("/T1", { method: "DELETE", body: { revision: 0 } })).status, 409);
          assert.equal(
            (await api("", { cookie: bob.cookie })).body.followedTopics[0].lastCheckedAt,
            null,
          );
        },
      );
      await t.test(
        "recent papers use primary topic, stable date ordering and 20-row pages",
        async () => {
          const all = [];
          for (let page = 1; page <= 3; page++) {
            const response = await api(`/papers?topicId=T1&page=${page}`);
            assert.equal(response.status, 200);
            assert.equal(response.cache, "private, no-store");
            assert.equal(response.body.papers.length, page === 3 ? 4 : 20);
            assert.equal(response.body.hasNext, page < 3);
            all.push(...response.body.papers);
          }
          assert.equal(new Set(all.map((row) => row.openAlexId)).size, 44);
          for (let index = 1; index < all.length; index++) {
            const a = all[index - 1],
              b = all[index];
            assert(
              a.publicationDate > b.publicationDate ||
                (a.publicationDate === b.publicationDate && a.openAlexId > b.openAlexId),
            );
          }
          await api("", { method: "POST", body: { topicId: "T2" } });
          assert.equal((await api("/papers?topicId=T2")).body.papers.length, 1);
          assert.equal((await api("/papers?page=99")).body.papers.length, 0);
        },
      );
      await t.test(
        "university aggregation deduplicates affiliations and respects month boundaries",
        async () => {
          const feb = await calculateTopicUniversities(papers, "T1", "2026-02");
          assert.equal(feb.universities.find((row) => row.id === id("I1")).papers, 42);
          assert.equal(feb.universities.find((row) => row.id === id("I2")).papers, 1);
          assert.equal(
            (await calculateTopicUniversities(papers, "T1", "2026-03")).universities[0].papers,
            2,
          );
          assert.equal(
            (await calculateTopicUniversities(papers, "T2", "2026-03")).universities[0].papers,
            1,
          );
          const response = await request("topics/T1/universities?month=2026-02");
          assert.equal(response.body.universities[0].papers, 42);
          assert.match(response.cache, /^public/);
          assert.deepEqual(
            (await request("topics/T1/universities?month=2026-01")).body.universities,
            [],
          );
        },
      );
      await t.test(
        "invalid values, client timestamps and unsupported fields are rejected",
        async () => {
          for (const suffix of [
            "/papers?page=0",
            "/papers?page=1&page=2",
            "/papers?topicId=T0",
            "/papers?topicId=T1&topicId=T2",
          ])
            assert.equal((await api(suffix)).status, 400);
          for (const month of ["2026-13", "2026-1", "2026-01&month=2026-02"])
            assert.equal((await request(`topics/T1/universities?month=${month}`)).status, 400);
          for (const body of [
            { revision: 1, note: { $ne: null } },
            { revision: 1, note: "x".repeat(2001) },
            { note: "missing revision" },
          ])
            assert.equal((await api("/T1", { method: "PATCH", body })).status, 400);
          assert.equal((await api("", { method: "POST", raw: "{broken" })).status, 400);
          assert.equal(
            (await api("", { method: "POST", body: {}, type: "text/plain" })).status,
            415,
          );
          assert.equal(
            (await api("/T1", { method: "PATCH", body: { note: "x".repeat(20000) } })).status,
            413,
          );
        },
      );
      await t.test(
        "unfollowing deletes only the owner's record and removes papers from that feed",
        async () => {
          assert.equal((await api("/T1", { method: "DELETE", body: { revision: 1 } })).status, 200);
          assert.equal((await api("/papers?topicId=T1")).status, 404);
          assert.equal((await api("/papers")).body.papers.length, 1);
          assert.equal((await api("", { cookie: bob.cookie })).body.followedTopics.length, 1);
          assert.equal((await api("/T1/check", { method: "POST", body: {} })).status, 404);
          await request("auth/logout", { method: "POST", body: {}, cookie: alice.cookie });
          assert.equal((await api()).status, 401);
        },
      );
    } finally {
      caches?.stop();
      if (server) await new Promise((resolve) => server.close(resolve));
      try {
        assert(dbName.startsWith("paperpulse_topics_test_"));
        await db.dropDatabase();
      } finally {
        await client.close();
      }
    }
  },
);
