export class TopicInputError extends Error {}

export function topicId(value) {
  const match =
    typeof value === "string" && value.match(/^(?:https:\/\/openalex\.org\/)?(T[1-9]\d{0,19})$/);
  if (!match) throw new TopicInputError("Use a valid OpenAlex Topic ID.");
  return `https://openalex.org/${match[1]}`;
}

export function pageNumber(value = "1") {
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value))
    throw new TopicInputError("Use a valid page number.");
  return Number(value);
}

export function monthRange(value) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value))
    throw new TopicInputError("Use a month in YYYY-MM format.");
  const [year, month] = value.split("-").map(Number);
  return { $gte: new Date(Date.UTC(year, month - 1, 1)), $lt: new Date(Date.UTC(year, month, 1)) };
}

export function topicBody(body, allowed) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new TopicInputError("The request contains unsupported fields.");
}

export function topicRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TopicInputError("Reload this followed topic before editing.");
  return value;
}

export function topicError(error, _req, res, _next) {
  if (error instanceof TopicInputError) return res.status(400).json({ error: error.message });
  if (error.type === "entity.parse.failed")
    return res.status(400).json({ error: "Invalid JSON request." });
  if (error.type === "entity.too.large")
    return res.status(413).json({ error: "Request is too large." });
  console.error(`Topic request failed (${error.name}).`);
  return res.status(503).json({ error: "Topics are temporarily unavailable. Please try again." });
}
