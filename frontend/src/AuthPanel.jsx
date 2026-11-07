import { useEffect, useState } from "react";
import "./AuthPanel.css";

async function authRequest(action, { body, signal } = {}) {
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
  return data.user;
}

export default function AuthPanel() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    authRequest("me", { signal: controller.signal })
      .then((currentUser) => {
        if (!controller.signal.aborted) setUser(currentUser);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not check your sign-in status.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, []);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setPending(true);
    setError("");
    try {
      setUser(await authRequest(mode, { body }));
      form.reset();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    setError("");
    try {
      await authRequest("logout", { body: {} });
      setUser(null);
      setMode("login");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  const registering = mode === "register";
  return (
    <section className="auth-panel" aria-labelledby="account-heading">
      <h3 id="account-heading">
        {user ? "Your account" : registering ? "Create an account" : "Sign in"}
      </h3>
      {checking ? (
        <p role="status">Checking sign-in status…</p>
      ) : user ? (
        <div className="auth-account">
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
          <button type="button" onClick={signOut} disabled={pending}>
            Sign out
          </button>
        </div>
      ) : (
        <>
          <form key={mode} className="auth-form" onSubmit={submit}>
            <label>
              Email
              <input type="email" name="email" autoComplete="email" maxLength={254} required />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <button type="submit" disabled={pending}>
              {registering ? "Create account" : "Sign in"}
            </button>
          </form>
          {registering && <p className="auth-hint">Use at least 8 characters for your password.</p>}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMode(registering ? "login" : "register");
              setError("");
            }}
          >
            {registering ? "Back to sign in" : "Create an account"}
          </button>
        </>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
