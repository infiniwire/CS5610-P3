import express from "express";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { configureAuth } from "./auth.js";
import { connectDatabase } from "./database.js";
import { createDatasetSummaryCache } from "./dataset-summary.js";
import { createAnalysisCache } from "./analysis.js";
import { createRankingsCache } from "./rankings.js";
import { createPaperRouter, ensurePaperIndexes } from "./papers.js";
import { createSavedPaperRouter, ensureSavedPaperIndexes } from "./saved-papers.js";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required to start PaperPulse.");
  process.exit(1);
}
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || Buffer.byteLength(sessionSecret) < 32) {
  console.error("SESSION_SECRET must be configured with at least 32 bytes.");
  process.exit(1);
}

let client;
try {
  client = await connectDatabase(uri);
  console.log("MongoDB connection verified.");
} catch (error) {
  console.error(`MongoDB startup connection failed (${error.name}).`);
  process.exit(1);
}

const app = express();
app.locals.db = client.db("paperpulse");
const papers = app.locals.db.collection("papers");
const summaryCache = createDatasetSummaryCache(papers, app.locals.db.collection("appCache"));
const analysisCache = createAnalysisCache(papers, app.locals.db.collection("appCache"));
const rankingsCache = createRankingsCache(papers, app.locals.db.collection("appCache"));
app.use("/api/papers", createPaperRouter(papers, summaryCache));
app.get("/api/analysis", async (_req, res) => {
  try {
    const data = await analysisCache.get();
    const maxAge = Math.max(
      0,
      Math.floor((new Date(data.nextRefreshAt).getTime() - Date.now()) / 1000),
    );
    res.set("Cache-Control", `public, max-age=${maxAge}`).json(data);
  } catch (error) {
    console.error(`Analysis request failed (${error.name}).`);
    res
      .status(503)
      .json({ error: "Analysis is temporarily unavailable. Please try again shortly." });
  }
});

app.get("/api/rankings", async (_req, res) => {
  try {
    const data = await rankingsCache.get();
    const maxAge = Math.max(
      0,
      Math.floor((new Date(data.nextRefreshAt).getTime() - Date.now()) / 1000),
    );
    res.set("Cache-Control", `public, max-age=${maxAge}`).json(data);
  } catch (error) {
    console.error(`Rankings request failed (${error.name}).`);
    res
      .status(503)
      .json({ error: "Rankings are temporarily unavailable. Please try again shortly." });
  }
});

try {
  await Promise.all([
    ensurePaperIndexes(papers),
    ensureSavedPaperIndexes(app.locals.db.collection("savedPapers")),
    configureAuth(app, client, sessionSecret),
  ]);
} catch (error) {
  console.error(`Could not initialize PaperPulse (${error.name}).`);
  await client.close();
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3000);
const frontend = fileURLToPath(new URL("../frontend/dist/", import.meta.url));

app.use(
  "/api/saved-papers",
  createSavedPaperRouter(app.locals.db.collection("savedPapers"), papers),
);
app.use(express.static(frontend));
app.get(
  ["/papers", "/analysis", "/rankings", "/saved-papers", "/my-topics", "/settings"],
  (_req, res) => res.sendFile("index.html", { root: frontend }),
);
const server = app.listen(port, "0.0.0.0", async (error) => {
  if (error) {
    console.error(`PaperPulse could not listen on port ${port} (${error.code}).`);
    process.exitCode = 1;
    await client.close();
    return;
  }

  console.log(`PaperPulse listening on port ${port}`);
  void summaryCache.start();
  void analysisCache.start();
  void rankingsCache.start();
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    summaryCache.stop();
    analysisCache.stop();
    rankingsCache.stop();
    server.close(() => client.close());
  });
}
