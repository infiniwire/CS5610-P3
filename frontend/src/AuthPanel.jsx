import { useEffect, useId, useRef, useState } from "react";
import { authRequest } from "./authRequest.js";
import "./AuthPanel.css";

export default function AuthPanel({ headingId, open, onUserChange, onSignedIn }) {
  const generatedHeadingId = useId();
  const labelId = headingId ?? generatedHeadingId;
  const formRef = useRef(null);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    authRequest("me", { signal: controller.signal })
      .then(({ user: currentUser }) => {
        if (!controller.signal.aborted) {
          setUser(currentUser);
          onUserChange?.(currentUser);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUser(null);
          onUserChange?.(null);
          setError("Could not check your sign-in status.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [onUserChange, open]);

  useEffect(() => {
    setMode("login");
    setError("");
    formRef.current?.reset();
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setPending(true);
    setError("");
    try {
      const { user: currentUser } = await authRequest(mode, { body });
      setUser(currentUser);
      onUserChange?.(currentUser);
      form.reset();
      onSignedIn?.();
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
      onUserChange?.(null);
      setMode("login");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }
  const registering = mode === "register";

  return (
    <section className="auth-panel" aria-labelledby={labelId}>
      <h3 id={labelId}>{user ? "Your account" : registering ? "Create an account" : "Sign in"}</h3>
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
          <form key={mode} ref={formRef} className="auth-form" onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                autoFocus={open}
                maxLength={254}
                required
              />
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
            className="auth-mode-toggle"
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
