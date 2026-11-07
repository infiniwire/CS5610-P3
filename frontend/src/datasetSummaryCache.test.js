import assert from "node:assert/strict";
import { test } from "node:test";

const summary = {
  total: 10,
  types: [{ type: "article", count: 10 }],
  affiliations: { usOnly: 7, canadaOnly: 2, collaboration: 1 },
  nextRefreshAt: new Date(Date.now() + 60_000).toISOString(),
};

async function freshModule(name) {
  return import(`./datasetSummaryCache.js?test=${name}`);
}

function mockStorage(t, storage) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
}

test("a fresh browser snapshot renders immediately without fetching", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected fetch");
  });
  mockStorage(t, { getItem: () => JSON.stringify(summary) });
  const cache = await freshModule("fresh");
  assert.deepEqual(cache.readDatasetSummary(), summary);
  assert.deepEqual(await cache.loadDatasetSummary(), summary);
  assert.equal(fetch.mock.callCount(), 0);
});

test("an expired snapshot stays visible and concurrent loads share one request", async (t) => {
  const expired = { ...summary, nextRefreshAt: "2020-01-01T00:00:00Z" };
  let stored;
  mockStorage(t, {
    getItem: () => JSON.stringify(expired),
    setItem: (_key, value) => {
      stored = JSON.parse(value);
    },
  });
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => summary }));
  const cache = await freshModule("expired");
  assert.deepEqual(cache.readDatasetSummary(), expired);
  const results = await Promise.all([cache.loadDatasetSummary(), cache.loadDatasetSummary()]);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(results, [summary, summary]);
  assert.deepEqual(stored, summary);
});

test("storage being blocked still permits loading and reusing the summary", async (t) => {
  mockStorage(t, {
    getItem() {
      throw new Error("Blocked");
    },
    setItem() {
      throw new Error("Blocked");
    },
  });
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => summary }));
  const cache = await freshModule("blocked");
  assert.equal(cache.readDatasetSummary(), null);
  await cache.loadDatasetSummary();
  assert.deepEqual(await cache.loadDatasetSummary(), summary);
  assert.equal(fetch.mock.callCount(), 1);
});
