export async function topicRequest(path, { method = "GET", body, signal, personal = true } = {}) {
  const response = await fetch(`/api/${path}`, {
    method,
    signal,
    cache: personal ? "no-store" : "default",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error ?? "Could not load topics. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export const shortTopicId = (id) => encodeURIComponent(id.split("/").at(-1));
