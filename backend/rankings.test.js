import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateRankings, rankRows } from "./rankings.js";

test("equal scores share competition ranks and ties have a stable identity order", () => {
  const rows = [
    { id: "A3", citations: 2 },
    { id: "A2", citations: 10 },
    { id: "A1", citations: 10 },
    { id: "A4", citations: 0 },
  ];
  const result = rankRows(rows, "citations");
  assert.deepEqual(
    result.map((row) => row.id),
    ["A1", "A2", "A3", "A4"],
  );
  assert.deepEqual(
    result.map((row) => row.rank),
    [1, 1, 3, 4],
  );
  assert.equal(rows[0].id, "A3");
  assert.equal(rows[0].rank, undefined);
});

test("publication and citation rankings use their own population-wide score", () => {
  const rows = [
    { id: "I1", papers: 20, citations: 2 },
    { id: "I2", papers: 1, citations: 40 },
    { id: "I3", papers: 10, citations: 10 },
  ];
  assert.deepEqual(
    rankRows(rows, "papers").map((row) => row.id),
    ["I1", "I3", "I2"],
  );
  assert.deepEqual(
    rankRows(rows, "citations").map((row) => row.id),
    ["I2", "I3", "I1"],
  );
});

test("global ranks remain correct after slicing later pages; zero ties and empty lists are valid", () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({ id: `T${index}`, papers: 50 - index }));
  assert.equal(rankRows(rows, "papers").slice(20, 40)[0].rank, 21);
  assert.deepEqual(
    rankRows(
      [
        { id: "A1", citations: 0 },
        { id: "A2", citations: 0 },
      ],
      "citations",
    ).map((row) => row.rank),
    [1, 1],
  );
  assert.deepEqual(rankRows([], "papers"), []);
});

test("mean rankings differ from total citations and use unrounded values for ranking", () => {
  const rows = [
    { id: "I1", citations: 1000, meanCitations: 1 },
    { id: "I2", citations: 20, meanCitations: 2 },
    { id: "I3", citations: 3, meanCitations: 3 },
    { id: "I4", citations: 3004, meanCitations: 3.004 },
  ];
  assert.deepEqual(
    rankRows(rows, "meanCitations").map((row) => row.id),
    ["I4", "I3", "I2", "I1"],
  );
  assert.deepEqual(
    rankRows(rows, "meanCitations").map((row) => row.rank),
    [1, 2, 3, 4],
  );
  assert.notDeepEqual(
    rankRows(rows, "meanCitations").map((row) => row.id),
    rankRows(rows, "citations").map((row) => row.id),
  );
});

test("empty data still returns an available, empty university mean board", async () => {
  const papers = {
    find: () => ({ toArray: async () => [] }),
    aggregate: () => ({
      toArray: async () => [{ overview: [], universities: [], authors: [], topics: [] }],
    }),
  };
  const data = await calculateRankings(papers);
  assert.equal(data.overview.total, 0);
  assert.deepEqual(data.universities.byMeanCitations, []);
});
