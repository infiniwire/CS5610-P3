import express from "express";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { configureAuth } from "./auth.js";
import { connectDatabase } from "./database.js";
import { createPaperRouter, ensurePaperIndexes } from "./papers.js";

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
app.use("/api/papers", createPaperRouter(papers));

try {
  await Promise.all([
    ensurePaperIndexes(papers),
    configureAuth(app, client, sessionSecret),
  ]);
} catch (error) {
  console.error(`Could not initialize PaperPulse (${error.name}).`);
  await client.close();
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3000);
const frontend = fileURLToPath(new URL("../frontend/dist/", import.meta.url));

app.use(express.static(frontend));
app.get("/papers", (_req, res) => res.sendFile("index.html", { root: frontend }));
const server = app.listen(port, "0.0.0.0", async (error) => {
  if (error) {
    console.error(`PaperPulse could not listen on port ${port} (${error.code}).`);
    process.exitCode = 1;
    await client.close();
    return;
  }

  console.log(`PaperPulse listening on port ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => client.close());
  });
}
