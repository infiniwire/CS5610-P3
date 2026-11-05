import { setTimeout as delay } from "node:timers/promises";
import { connectDatabase } from "./database.js";

const args = process.argv.slice(2);
const additionalOnly = args.includes("--additional-types");
const [through, from = "2026-01-01"] = args.filter((arg) => arg !== "--additional-types");
const dateFormat = /^2026-\d{2}-\d{2}$/;
const validDate = (value) =>
  dateFormat.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

if (!validDate(from) || !validDate(through) || from > through) {
  console.error("Usage: npm run import:openalex -- <end date in 2026> [start date in 2026] [--additional-types]");
  process.exit(1);
}

const { OPENALEX_API_KEY: apiKey, MONGODB_URI: uri } = process.env;
if (!apiKey || !uri) {
  console.error("OPENALEX_API_KEY and MONGODB_URI are required.");
  process.exit(1);
}

const countries = new Set(["US", "CA"]);
const batches = [
  {
    name: "Journal papers",
    types: ["article", "review"],
    checkpointPrefix: "works-2026-us-ca-education-v1:",
  },
  {
    name: "Conference, data, and software papers",
    types: ["conference-paper", "data-paper", "software-paper"],
    checkpointPrefix: "other-papers-2026-us-ca-education-v1:",
  },
];
// Publisher metadata verified by DOI for works with a missing OpenAlex title.
const verifiedMetadata = new Map([
  ["https://openalex.org/W7154034643", {
    doi: "https://doi.org/10.15036/arerugi.75.102",
    title: "C1-INH正常遺伝性血管性浮腫：診断，病態生理，及び治療に関する最新の国際的コンセンサスペーパー",
    publicationDate: "2026-04-10",
    url: "https://www.jstage.jst.go.jp/article/arerugi/75/2/75_102/_article/-char/ja",
  }],
  ["https://openalex.org/W7161034666", {
    doi: "https://doi.org/10.46747/cfp.7205e147",
    title: "Les meilleures études en 2025 adaptées aux soins primaires",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC13171045/",
  }],
]);
const fields = [
  "id", "display_name", "doi", "publication_date", "type", "authorships",
  "primary_topic", "topics", "cited_by_count", "primary_location", "is_retracted",
].join(",");
const api = new URL("https://api.openalex.org");
const requestSpacingMs = additionalOnly ? 220 : 45;
const workers = 24;
let nextRequestAt = 0;
let pauseUntil = 0;

async function getOpenAlex(path, params) {
  const url = new URL(path, api);
  url.search = new URLSearchParams(params);

  for (let attempt = 0; attempt < 8; attempt++) {
    const slot = Math.max(Date.now(), nextRequestAt, pauseUntil);
    nextRequestAt = slot + requestSpacingMs;
    await delay(Math.max(0, slot - Date.now()));
    if (Date.now() < pauseUntil) {
      attempt--;
      continue;
    }

    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return await response.json();
    } catch {
      await delay(Math.min(20_000, 500 * 2 ** attempt));
      continue;
    }

    await response.body?.cancel();
    if (response.status === 429) {
      if (response.headers.get("x-ratelimit-remaining") === "0") {
        throw new Error("OpenAlex daily quota exhausted. Rerun after the quota resets to resume.");
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      if (Date.now() >= pauseUntil && waitMs >= 5000) {
        console.log(`OpenAlex is rate limiting requests. Retrying in ${Math.ceil(waitMs / 1000)}s.`);
      }
      pauseUntil = Math.max(pauseUntil, Date.now() + waitMs);
    } else if (response.status >= 500 || response.status === 408) {
      await delay(Math.min(20_000, 500 * 2 ** attempt));
    } else {
      throw new Error(`OpenAlex returned HTTP ${response.status} for ${path}.`);
    }
  }
  throw new Error(`OpenAlex requests for ${path} failed repeatedly.`);
}

async function fetchEducationInstitutions() {
  const institutions = new Map();
  let cursor = "*";
  do {
    const page = await getOpenAlex("/institutions", {
      filter: "country_code:us|ca,type:education",
      select: "id,display_name,country_code",
      per_page: "100",
      cursor,
    });
    for (const institution of page.results) {
      institutions.set(institution.id, {
        id: institution.id,
        name: institution.display_name,
        country: institution.country_code,
      });
    }
    cursor = page.results.length ? page.meta.next_cursor : null;
  } while (cursor);
  if (!institutions.size) throw new Error("OpenAlex returned an empty education institution catalog.");
  return institutions;
}

function getUniversities(authorships, education) {
  const universities = new Map();
  for (const authorship of authorships) {
    for (const institution of authorship.institutions ?? []) {
      if (!countries.has(institution.country_code)) continue;
      if (institution.type === "education") {
        universities.set(institution.id, {
          id: institution.id,
          name: institution.display_name,
          country: institution.country_code,
        });
      }
      for (const ancestorId of institution.lineage ?? []) {
        const university = education.get(ancestorId);
        if (university?.country === institution.country_code) {
          universities.set(university.id, university);
        }
      }
    }
  }
  return [...universities.values()];
}

function normalizeTopic(topic) {
  if (!topic?.id) return null;
  return {
    id: topic.id,
    name: topic.display_name,
    subfieldId: topic.subfield?.id ?? null,
    fieldId: topic.field?.id ?? null,
    domainId: topic.domain?.id ?? null,
  };
}

async function importDay(day, saved, batch, education, papers, checkpoints) {
  const id = batch.checkpointPrefix + day;
  const state = saved ?? {
    day, cursor: "*", expected: null, fetched: 0, matched: 0,
    unrelated: 0, invalid: 0, expandedAuthorships: 0,
  };
  delete state._id;
  const publicationFilter = batch.types.includes("article")
    ? `from_publication_date:${day},to_publication_date:${day}`
    : `publication_date:${day}`;
  const filter = `${publicationFilter},institutions.country_code:us|ca,type:${batch.types.join("|")}`;

  while (state.cursor) {
    const page = await getOpenAlex("/works", {
      filter,
      corpus: "all",
      select: fields,
      sort: "publication_date:asc",
      per_page: "100",
      cursor: state.cursor,
    });
    const operations = [];
    state.expected ??= page.meta.count;
    for (let work of page.results) {
      if (work.authorships?.length === 100 && /^https:\/\/openalex\.org\/W\d+$/.test(work.id)) {
        work = await getOpenAlex(`/works/${work.id.split("/").at(-1)}`, { select: fields });
        state.expandedAuthorships++;
      }
      if (
        !/^https:\/\/openalex\.org\/W\d+$/.test(work.id) ||
        !batch.types.includes(work.type) ||
        work.publication_date !== day
      ) {
        state.invalid++;
        continue;
      }
      const authorships = work.authorships ?? [];
      const institutions = getUniversities(authorships, education);
      if (!institutions.length) {
        state.unrelated++;
        continue;
      }
      const metadata = verifiedMetadata.get(work.id);
      const correction = metadata?.doi === work.doi ? metadata : undefined;
      const openAlexTitle = work.display_name?.trim();
      const title = openAlexTitle || correction?.title;
      if (!title) {
        state.invalid++;
        continue;
      }
      const paper = {
        openAlexId: work.id,
        title,
        doi: work.doi ?? null,
        publicationDate: new Date(day),
        type: work.type,
        authors: authorships.map(({ author, raw_author_name }) => ({
          id: author?.id ?? null,
          name: author?.display_name ?? raw_author_name ?? null,
        })),
        institutions,
        primaryTopic: normalizeTopic(work.primary_topic),
        topics: (work.topics ?? []).map(normalizeTopic).filter(Boolean),
        citedByCount: work.cited_by_count ?? 0,
        sourceUrl: work.primary_location?.landing_page_url ?? work.doi ?? work.id,
        isRetracted: work.is_retracted === true,
        source: "OpenAlex",
        syncedAt: new Date(),
      };
      if (!openAlexTitle) paper.titleSourceUrl = correction.url;
      if (correction?.publicationDate && correction.publicationDate !== day) {
        paper.openAlexPublicationDate = paper.publicationDate;
        paper.publicationDate = new Date(correction.publicationDate);
        paper.publicationDateSourceUrl = correction.url;
      }
      operations.push({
        updateOne: {
          filter: { openAlexId: paper.openAlexId },
          update: { $set: paper },
          upsert: true,
        },
      });
    }

    if (operations.length) await papers.bulkWrite(operations, { ordered: false });
    state.fetched += page.results.length;
    state.matched += operations.length;
    const next = page.results.length ? page.meta.next_cursor : null;
    if (next && next === state.cursor) throw new Error(`Cursor repeated for ${day}.`);
    state.cursor = next ?? null;
    state.complete = !state.cursor;
    state.lastCount = page.meta.count;
    await checkpoints.updateOne({ _id: id }, { $set: state }, { upsert: true });
  }

  return state;
}

async function importBatch(batch, days, education, papers, checkpoints) {
  const saved = new Map(
    (await checkpoints.find({
      _id: {
        $gte: batch.checkpointPrefix + from,
        $lte: batch.checkpointPrefix + through,
      },
    }).toArray()).map((state) => [state.day, state]),
  );
  const pending = days.filter((day) => !saved.get(day)?.complete);
  console.log(`${batch.name}: ${pending.length}/${days.length} dates pending.`);

  let nextDay = 0;
  let completed = days.length - pending.length;
  let failure;
  await Promise.all(Array.from({ length: Math.min(workers, pending.length) }, async () => {
    while (!failure && nextDay < pending.length) {
      const day = pending[nextDay++];
      try {
        const state = await importDay(day, saved.get(day), batch, education, papers, checkpoints);
        saved.set(day, state);
        completed++;
        if (completed % 10 === 0 || completed === days.length) {
          console.log(`Completed ${completed}/${days.length} dates.`);
        }
      } catch (error) {
        failure ??= error;
      }
    }
  }));
  if (failure) throw failure;

  const imported = [...saved.values()];
  console.log(JSON.stringify({
    batch: batch.name,
    completedDates: completed,
    candidates: imported.reduce((sum, day) => sum + day.fetched, 0),
    matched: imported.reduce((sum, day) => sum + day.matched, 0),
    excludedAffiliation: imported.reduce((sum, day) => sum + day.unrelated, 0),
    invalidOrChanged: imported.reduce((sum, day) => sum + day.invalid, 0),
    expandedAuthorships: imported.reduce((sum, day) => sum + day.expandedAuthorships, 0),
    datesWithCountMismatch: imported
      .filter((day) => day.fetched !== day.lastCount)
      .map(({ day, fetched, lastCount }) => ({ day, fetched, lastCount })),
  }));
}

let client;
try {
  client = await connectDatabase(uri);
  const db = client.db("paperpulse");
  const papers = db.collection("papers");
  const checkpoints = db.collection("_openalexImport");
  await papers.createIndex({ openAlexId: 1 }, { unique: true });
  await papers.createIndex({ publicationDate: 1 });

  const education = await fetchEducationInstitutions();
  const days = [];
  for (let time = Date.parse(from); time <= Date.parse(through); time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  console.log(`OpenAlex ${from} through ${through}. ${education.size} education institutions.`);
  for (const batch of additionalOnly ? batches.slice(1) : batches) {
    await importBatch(batch, days, education, papers, checkpoints);
  }
} catch (error) {
  console.error(error.name === "Error" ? error.message : `Import failed (${error.name}).`);
  process.exitCode = 1;
} finally {
  await client?.close();
}
