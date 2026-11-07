export const readingStatuses = { unread: "Unread", reading: "Reading", read: "Read" };

export async function savedPaperRequest(path = "", { method = "GET", body, signal } = {}) {
  const response = await fetch(`/api/saved-papers${path}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error ?? "Could not reach your saved papers. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export function savedPaperPath(openAlexId) {
  return `/${encodeURIComponent(openAlexId.split("/").at(-1))}`;
}
