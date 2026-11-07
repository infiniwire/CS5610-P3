export async function authRequest(action, { body, signal } = {}) {
  const response = await fetch(`/api/auth/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.error ?? "Could not reach the authentication service.");
  }
  return data;
}
