import assert from "node:assert/strict";
import { test } from "node:test";

const sample = {
  overview: { total: 10 },
  monthly: [],
  citations: {},
  topics: [],
  heatmap: [],
  countryAnalysis: { groups: [] },
  nextRefreshAt: new Date(Date.now() + 86_400_000).toISOString(),
};
function storage(t, value) {
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else delete globalThis.localStorage;
  });
}

test("fresh persisted analysis renders without an API request", async (t) => {
  storage(t, { getItem: () => JSON.stringify(sample) });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected request");
  });
  const cache = await import("./analysisCache.js?fresh");
  assert.deepEqual(cache.readAnalysis(), sample);
  assert.deepEqual(await cache.loadAnalysis(), sample);
  assert.equal(fetch.mock.callCount(), 0);
});

test("expired analysis is retained through failures, and repeated requests share a refresh", async (t) => {
  const old = { ...sample, nextRefreshAt: "2020-01-01T00:00:00Z" };
  let saved;
  storage(t, {
    getItem: () => JSON.stringify(old),
    setItem: (_key, value) => {
      saved = JSON.parse(value);
    },
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => ({ ok: false }));
  const cache = await import("./analysisCache.js?stale");
  await assert.rejects(cache.loadAnalysis(), /unavailable/);
  assert.deepEqual(cache.readAnalysis(), old);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => sample }));
  await Promise.all([cache.loadAnalysis(), cache.loadAnalysis()]);
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(saved, sample);
});

test("disabled browser storage does not prevent loading analysis", async (t) => {
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
  const cache = await import("./analysisCache.js?blocked");
  assert.equal(cache.readAnalysis(), null);
  assert.deepEqual(await cache.loadAnalysis(), sample);
  assert.deepEqual(await cache.loadAnalysis(), sample);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[0], "/api/analysis?v=2");
});

test("responses without country analysis cannot poison the new snapshot cache", async (t) => {
  storage(t, {
    getItem: () => null,
    setItem() {
      assert.fail("Invalid snapshot must not be stored");
    },
  });
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ ...sample, countryAnalysis: undefined }),
  }));
  const cache = await import("./analysisCache.js?old-version");
  await assert.rejects(cache.loadAnalysis(), /unavailable/);
  assert.equal(cache.readAnalysis(), null);
});
