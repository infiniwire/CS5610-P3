import assert from "node:assert/strict";
import { test } from "node:test";

const boards = { byCitations: [], byPapers: [] };
const sample = {
  overview: { total: 10 },
  papers: [],
  universities: { ...boards, byMeanCitations: [] },
  authors: boards,
  topics: boards,
  nextRefreshAt: new Date(Date.now() + 86_400_000).toISOString(),
};
function storage(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
}

test("fresh ranking snapshots are reused without fetching, including across board changes", async (t) => {
  storage(t, { getItem: () => JSON.stringify(sample) });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected request");
  });
  const cache = await import("./rankingsCache.js?fresh");
  assert.deepEqual(cache.readRankings(), sample);
  await cache.loadRankings();
  await cache.loadRankings();
  assert.equal(fetch.mock.callCount(), 0);
});

test("expired rankings stay available after failure, and concurrent retries share one request", async (t) => {
  const old = { ...sample, nextRefreshAt: "2020-01-01T00:00:00Z" };
  let saved;
  storage(t, {
    getItem: () => JSON.stringify(old),
    setItem: (_key, value) => {
      saved = JSON.parse(value);
    },
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => ({ ok: false }));
  const cache = await import("./rankingsCache.js?stale");
  await assert.rejects(cache.loadRankings(), /unavailable/);
  assert.deepEqual(cache.readRankings(), old);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => sample }));
  await Promise.all([cache.loadRankings(), cache.loadRankings()]);
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(saved, sample);
});

test("disabled storage does not prevent loading and caching rankings", async (t) => {
  storage(t, {
    getItem() {
      throw new Error("Blocked");
    },
    setItem() {
      throw new Error("Blocked");
    },
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => sample,
  }));
  const cache = await import("./rankingsCache.js?blocked");
  assert.equal(cache.readRankings(), null);
  assert.deepEqual(await cache.loadRankings(), sample);
  assert.deepEqual(await cache.loadRankings(), sample);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[0], "/api/rankings?v=2");
});

test("an old response without the mean board is rejected instead of poisoning the new cache", async (t) => {
  storage(t, {
    getItem: () => null,
    setItem() {
      assert.fail("Invalid snapshots must not be stored");
    },
  });
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ ...sample, universities: boards }),
  }));
  const cache = await import("./rankingsCache.js?old-schema");
  await assert.rejects(cache.loadRankings(), /unavailable/);
  assert.equal(cache.readRankings(), null);
});
