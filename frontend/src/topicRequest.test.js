import assert from "node:assert/strict";
import { test } from "node:test";
import { shortTopicId, topicRequest } from "./topicRequest.js";

test("personal topic reads and writes bypass browser caches and retain JSON fields", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);
    return { ok: true, json: async () => ({ followedTopics: [] }) };
  });
  await topicRequest("followed-topics");
  await topicRequest("followed-topics/T1", {
    method: "PATCH",
    body: { note: "My note", revision: 2 },
  });
  assert.equal(calls[0][0], "/api/followed-topics");
  assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[1][1].cache, "no-store");
  assert.equal(calls[1][1].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[1][1].body), { note: "My note", revision: 2 });
  assert.equal(shortTopicId("https://openalex.org/T123"), "T123");
});

test("public aggregates permit HTTP caching and private failures retain status for session expiry", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ topics: [] }),
  }));
  await topicRequest("topics?q=learning", { personal: false });
  assert.equal(fetch.mock.calls[0].arguments[1].cache, "default");
  fetch.mock.mockImplementation(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: "Sign in" }),
  }));
  await assert.rejects(
    topicRequest("followed-topics"),
    (error) => error.status === 401 && error.message === "Sign in",
  );
  fetch.mock.mockImplementation(async () => ({
    ok: false,
    status: 503,
    json: async () => {
      throw new Error("HTML response");
    },
  }));
  await assert.rejects(topicRequest("followed-topics"), (error) => error.status === 503);
});
