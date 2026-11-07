import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createDatasetSummaryCache } from "./dataset-summary.js";

const weekMs = 7 * 24 * 60 * 60 * 1000;
const summary = {
  total: 10,
  types: [{ type: "article", count: 10 }],
  affiliations: { usOnly: 7, canadaOnly: 2, collaboration: 1 },
};

function fixture(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-06T12:00:00Z") });
  let saved;
  let calculate = async () => [summary];
  let calls = 0;
  const papers = {
    aggregate: () => ({
      toArray: () => {
        calls++;
        return calculate();
      },
    }),
  };
  const snapshots = {
    async findOne() {
      return saved;
    },
    async updateOne(_filter, update) {
      saved = structuredClone(update.$set);
    },
  };
  function create() {
    const cache = createDatasetSummaryCache(papers, snapshots);
    t.after(() => cache.stop());
    return cache;
  }
  return {
    create,
    get calls() {
      return calls;
    },
    get saved() {
      return saved;
    },
    set calculate(value) {
      calculate = value;
    },
  };
}

test("concurrent requests share one calculation and restart reuses MongoDB snapshot", async (t) => {
  const f = fixture(t);
  const cache = f.create();
  const results = await Promise.all(Array.from({ length: 10 }, () => cache.get()));
  assert.equal(f.calls, 1);
  assert.equal(results[0].total, 10);
  assert.equal(results[0].nextRefreshAt - results[0].calculatedAt, weekMs);
  cache.stop();
  const restarted = f.create();
  assert.deepEqual(await restarted.get(), f.saved.summary);
  assert.equal(f.calls, 1);
});

test("server refreshes after seven days without a browser request", async (t) => {
  const f = fixture(t);
  const cache = f.create();
  await cache.start();
  t.mock.timers.tick(weekMs - 1);
  assert.equal(f.calls, 1);
  f.calculate = async () => [{ ...summary, total: 20 }];
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(f.calls, 2);
  assert.equal(f.saved.summary.total, 20);
  assert.equal((await cache.get()).total, 20);
});

test("serves the previous snapshot during refresh and retries failed refreshes", async (t) => {
  const f = fixture(t);
  const cache = f.create();
  const original = await cache.get();
  let rejectRefresh;
  f.calculate = () =>
    new Promise((_resolve, reject) => {
      rejectRefresh = reject;
    });
  t.mock.timers.tick(weekMs);
  assert.equal(await cache.get(), original);
  t.mock.method(console, "error", () => {});
  rejectRefresh(new Error("Database unavailable"));
  await setImmediate();
  assert.equal(await cache.get(), original);
  assert.equal(f.saved.summary.total, 10);
  f.calculate = async () => [{ ...summary, total: 30 }];
  t.mock.timers.tick(5 * 60 * 1000);
  await setImmediate();
  assert.equal((await cache.get()).total, 30);
  assert.equal(f.calls, 3);
});

test("expired snapshot on restart remains available while it refreshes", async (t) => {
  const f = fixture(t);
  const initial = f.create();
  await initial.start();
  initial.stop();
  t.mock.timers.tick(weekMs + 1000);
  let resolveRefresh;
  f.calculate = () =>
    new Promise((resolve) => {
      resolveRefresh = resolve;
    });
  const restarted = f.create();
  const starting = restarted.start();
  await setImmediate();
  assert.equal((await restarted.get()).total, 10);
  resolveRefresh([{ ...summary, total: 40 }]);
  await starting;
  assert.equal((await restarted.get()).total, 40);
});

test("an initial failure recovers on the scheduled retry", async (t) => {
  const f = fixture(t);
  t.mock.method(console, "error", () => {});
  f.calculate = async () => {
    throw new Error("Offline");
  };
  const cache = f.create();
  await assert.rejects(cache.get(), /unavailable/);
  f.calculate = async () => [summary];
  t.mock.timers.tick(5 * 60 * 1000);
  await setImmediate();
  assert.equal((await cache.get()).total, 10);
});
