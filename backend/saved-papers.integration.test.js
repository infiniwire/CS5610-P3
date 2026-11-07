import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { MongoClient } from "mongodb";
import { configureAuth } from "./auth.js";
import { createSavedPaperRouter, ensureSavedPaperIndexes } from "./saved-papers.js";

test(
  "saved paper CRUD with real sessions and isolated MongoDB data",
  { skip: !process.env.MONGODB_URI, timeout: 60000 },
  async (t) => {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const dbName = `paperpulse_saved_test_${randomBytes(8).toString("hex")}`;
    const db = client.db(dbName);
    let server;
    try {
      await client.connect();
      const papers = db.collection("papers");
      const saved = db.collection("savedPapers");
      await papers.insertMany(
        Array.from({ length: 24 }, (_, index) => ({
          openAlexId: `https://openalex.org/W${index + 1}`,
          title: `Integration paper ${index + 1}`,
          publicationDate: new Date("2026-01-01"),
          citedByCount: index,
          authors: [{ name: "Test Author" }],
          institutions: [],
        })),
      );
      const app = express();
      app.locals.db = db;
      await configureAuth(app, client, "saved-paper-integration-secret".repeat(2));
      await ensureSavedPaperIndexes(saved);
      app.use("/api/saved-papers", createSavedPaperRouter(saved, papers));
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const origin = `http://127.0.0.1:${server.address().port}`;
      async function request(
        path,
        { method = "GET", body, cookie, raw, type = "application/json" } = {},
      ) {
        const response = await fetch(`${origin}${path}`, {
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
      const alice = await request("/api/auth/register", {
        method: "POST",
        body: { email: "alice@example.invalid", password: "integration-password" },
      });
      const bob = await request("/api/auth/register", {
        method: "POST",
        body: { email: "bob@example.invalid", password: "integration-password" },
      });
      assert.equal(alice.status, 201);
      assert.equal(bob.status, 201);
      const api = (suffix = "", options = {}) =>
        request(`/api/saved-papers${suffix}`, { cookie: alice.cookie, ...options });

      await t.test("every operation requires authentication", async () => {
        for (const [method, path] of [
          ["GET", ""],
          ["GET", "/W1"],

          ["POST", ""],
          ["PATCH", "/W1"],
          ["DELETE", "/W1"],
        ]) {
          const result = await request(`/api/saved-papers${path}`, {
            method,
            ...(method === "GET" ? {} : { body: {} }),
          });
          assert.equal(result.status, 401);
          assert.equal(result.cache, "private, no-store");
        }
      });

      await t.test("create accepts only indexed papers and rejects forged ownership", async () => {
        assert.equal((await api("", { method: "POST", body: { openAlexId: "W999" } })).status, 404);
        for (const body of [
          { openAlexId: { $ne: null } },
          { openAlexId: "W1", userId: bob.body.user.id },
          [],
        ]) {
          assert.equal((await api("", { method: "POST", body })).status, 400);
        }
        const created = await api("", { method: "POST", body: { openAlexId: "W1" } });
        assert.equal(created.status, 201);
        assert.equal(created.body.savedPaper.readingStatus, "unread");
        assert.equal(created.body.savedPaper.notes, "");
        assert.equal(created.body.savedPaper.revision, 0);
        assert.equal(created.body.savedPaper.userId, undefined);
      });

      await t.test(
        "notes and all reading states persist; repeated saves retain notes",
        async () => {
          for (const [index, readingStatus] of ["reading", "read", "unread"].entries()) {
            const result = await api("/W1", {
              method: "PATCH",
              body: {
                revision: index,
                notes: "Line one\n中文笔记 <script>text only</script>",
                readingStatus,
              },
            });
            assert.equal(result.status, 200);
            assert.equal(result.body.savedPaper.revision, index + 1);
            assert.equal(result.body.savedPaper.readingStatus, readingStatus);
          }
          const duplicate = await api("", {
            method: "POST",
            body: { openAlexId: "https://openalex.org/W1" },
          });
          assert.equal(duplicate.status, 200);
          assert.equal(
            duplicate.body.savedPaper.notes,
            "Line one\n中文笔记 <script>text only</script>",
          );
          assert.equal(await saved.countDocuments({ openAlexId: "https://openalex.org/W1" }), 1);
          const retrieved = await api("/W1");
          assert.equal(retrieved.body.savedPaper.revision, 3);
        },
      );

      await t.test(
        "another user cannot read, edit or delete the record, and can independently save the same paper",
        async () => {
          assert.equal((await api("/W1", { cookie: bob.cookie })).body.savedPaper, null);
          assert.equal((await api("", { cookie: bob.cookie })).body.total, 0);
          assert.equal(
            (
              await api("/W1", {
                cookie: bob.cookie,
                method: "PATCH",
                body: { revision: 3, notes: "forged" },
              })
            ).status,
            404,
          );
          assert.equal(
            (await api("/W1", { cookie: bob.cookie, method: "DELETE", body: { revision: 3 } }))
              .status,
            404,
          );
          assert.equal(
            (await api("", { cookie: bob.cookie, method: "POST", body: { openAlexId: "W1" } }))
              .status,
            201,
          );
          assert.equal((await api("/W1", { cookie: bob.cookie })).body.savedPaper.notes, "");
        },
      );

      await t.test(
        "invalid updates, query injection, malformed JSON and non-JSON writes are rejected",
        async () => {
          for (const body of [
            { revision: 3, notes: { $ne: "" } },
            { revision: 3, notes: "a".repeat(10001) },
            { revision: 3, readingStatus: "done" },
            { revision: 3, userId: bob.body.user.id, notes: "forged" },
            { revision: 3 },
            { notes: "no revision" },
            { revision: -1, notes: "bad revision" },
          ]) {
            assert.equal((await api("/W1", { method: "PATCH", body })).status, 400);
          }
          for (const query of [
            "?page=0",
            "?page=1&page=2",
            "?status=invalid",
            "?status=read&status=unread",
          ])
            assert.equal((await api(query)).status, 400);
          assert.equal((await api("", { method: "POST", raw: "{broken" })).status, 400);
          assert.equal(
            (await api("", { method: "POST", body: {}, type: "text/plain" })).status,
            415,
          );
          assert.equal(
            (
              await api("/W1", {
                method: "PATCH",
                raw: JSON.stringify({ notes: "a".repeat(70000) }),
              })
            ).status,
            413,
          );
        },
      );

      await t.test(
        "concurrent saves remain unique; list pages contain at most twenty works and support status filters",
        async () => {
          const concurrent = await Promise.all([
            api("", { method: "POST", body: { openAlexId: "W2" } }),
            api("", { method: "POST", body: { openAlexId: "W2" } }),
          ]);
          assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 201]);
          for (let number = 3; number <= 23; number++)
            assert.equal(
              (await api("", { method: "POST", body: { openAlexId: `W${number}` } })).status,
              201,
            );
          const first = (await api()).body;
          const second = (await api("?page=2")).body;
          assert.equal(first.total, 23);
          assert.equal(first.savedPapers.length, 20);
          assert.equal(first.hasNext, true);
          assert.equal(second.savedPapers.length, 3);
          assert.equal(second.hasNext, false);
          assert.equal(
            new Set([...first.savedPapers, ...second.savedPapers].map((item) => item.openAlexId))
              .size,
            23,
          );
          assert(first.savedPapers.every((item) => item.paper.title && !item.userId));
          await api("/W2", { method: "PATCH", body: { revision: 0, readingStatus: "read" } });
          const filtered = (await api("?status=read")).body;
          assert.equal(filtered.total, 1);
          assert.equal(filtered.savedPapers[0].openAlexId, "https://openalex.org/W2");
        },
      );

      await t.test(
        "batch saved states include only requested works belonging to the current user",
        async () => {
          const status = await api("/status?ids=W1,W2,W999");
          assert.equal(status.status, 200);
          assert.equal(status.cache, "private, no-store");
          assert.deepEqual(Object.keys(status.body), ["savedIds"]);
          assert.deepEqual(status.body.savedIds.sort(), [
            "https://openalex.org/W1",
            "https://openalex.org/W2",
          ]);
          const other = await api("/status?ids=W1,W2,W999", { cookie: bob.cookie });
          assert.deepEqual(other.body.savedIds, ["https://openalex.org/W1"]);
          for (const suffix of [
            "/status",
            "/status?ids=",
            "/status?ids=W1&ids=W2",
            "/status?ids=invalid",
            `/status?ids=${Array.from({ length: 21 }, (_, index) => `W${index + 1}`).join(",")}`,
          ]) {
            assert.equal((await api(suffix)).status, 400);
          }
        },
      );

      await t.test(
        "stale or concurrent edits cannot silently overwrite notes or delete newer changes",
        async () => {
          const results = await Promise.all([
            api("/W1", { method: "PATCH", body: { revision: 3, notes: "first edit" } }),
            api("/W1", { method: "PATCH", body: { revision: 3, notes: "other edit" } }),
          ]);
          assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
          assert.equal((await api("/W1", { method: "DELETE", body: { revision: 3 } })).status, 409);
          assert.equal((await api("/W1", { method: "DELETE", body: { revision: 4 } })).status, 200);
          assert.equal((await api("/W1")).body.savedPaper, null);
          assert.equal(
            (await api("/W1", { cookie: bob.cookie })).body.savedPaper.readingStatus,
            "unread",
          );
        },
      );

      await t.test(
        "removed index records leave private notes available; logout revokes access",
        async () => {
          await papers.deleteOne({ openAlexId: "https://openalex.org/W2" });
          const filtered = (await api("?status=read")).body;
          assert.equal(filtered.savedPapers[0].paper, null);
          assert.equal(
            (await api("/W2", { method: "PATCH", body: { revision: 1, notes: "Keep my notes" } }))
              .status,
            200,
          );
          await request("/api/auth/logout", { cookie: alice.cookie, method: "POST", body: {} });
          assert.equal((await api()).status, 401);
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      try {
        assert(dbName.startsWith("paperpulse_saved_test_"));
        await db.dropDatabase();
      } finally {
        await client.close();
      }
    }
  },
);
