import assert from "node:assert/strict";
import { test } from "node:test";
import { citationStatistics } from "./analysis.js";

test("citation bands reconcile with the histogram; unknowns stay separate", () => {
  const values = [0, 1, 2, 5, 6, 10, 11, 25, 26, 100, 101, 500, 501];
  const stats = citationStatistics([
    ...values.map((_id) => ({ _id, count: 1 })),
    { _id: null, count: 3 },
  ]);
  assert.deepEqual(
    stats.bins.map((row) => row.count),
    [1, 1, 2, 2, 2, 2, 2, 1],
  );
  assert.equal(stats.known, values.length);
  assert.equal(stats.missing, 3);
  assert.equal(
    stats.total,
    values.reduce((a, b) => a + b, 0),
  );
  assert.equal(stats.median, 11);
  assert.equal(stats.lorenz[0].citations, 0);
  assert.equal(stats.lorenz.at(-1).citations, 1);
});

test("Lorenz concentration uses papers, not histogram groups", () => {
  const stats = citationStatistics([
    { _id: 0, count: 90 },
    { _id: 10, count: 10 },
  ]);
  assert.equal(stats.mean, 1);
  assert.equal(stats.median, 0);
  assert.equal(stats.topTenShare, 1);
  assert.equal(stats.lorenz[90].citations, 0);
  assert.equal(stats.lorenz[95].citations, 0.5);
  for (let i = 1; i < stats.lorenz.length; i++) {
    assert(stats.lorenz[i].citations >= stats.lorenz[i - 1].citations);
    assert(stats.lorenz[i].citations <= stats.lorenz[i].papers + 1e-10);
  }
});

test("median of an even population averages the two central paper counts", () => {
  const stats = citationStatistics([
    { _id: 10, count: 2 },
    { _id: 0, count: 2 },
  ]);
  assert.equal(stats.median, 5);
  assert.equal(stats.mean, 5);
});

test("equal counts follow the equality line; zero and missing populations avoid invented concentration", () => {
  const equal = citationStatistics([{ _id: 3, count: 100 }]);
  assert(Math.abs(equal.topTenShare - 0.1) < 1e-10);
  assert(equal.lorenz.every((row) => Math.abs(row.papers - row.citations) < 1e-10));
  const zeros = citationStatistics([{ _id: 0, count: 4 }]);
  assert.equal(zeros.mean, 0);
  assert.equal(zeros.topTenShare, null);
  const empty = citationStatistics([{ _id: null, count: 4 }]);
  assert.equal(empty.mean, null);
  assert.equal(empty.median, null);
  assert.equal(empty.known, 0);
  assert.equal(empty.missing, 4);
});
