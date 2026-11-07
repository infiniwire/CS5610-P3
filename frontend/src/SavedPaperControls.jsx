import { useEffect, useState } from "react";
import { useReader } from "./ReaderContext.js";
import SavedPaperEditor from "./SavedPaperEditor.jsx";
import { savedPaperPath, savedPaperRequest } from "./savedPaperRequest.js";
import "./SavedPaperControls.css";

export default function SavedPaperControls({ openAlexId, onSavedChange }) {
  const { user, checking, requestSignIn, sessionExpired } = useReader();
  const userId = user?.id;
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!userId) return;
    const owner = userId;
    const controller = new AbortController();
    setResult(null);
    setNotice("");
    savedPaperRequest(savedPaperPath(openAlexId), { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ owner, savedPaper: data.savedPaper });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ owner, error: error.message });
        if (error.status === 401) sessionExpired();
      });
    return () => controller.abort();
  }, [userId, openAlexId, attempt, sessionExpired]);

  function update(savedPaper, message) {
    setResult({ owner: user.id, savedPaper });
    setNotice(message);
    onSavedChange?.();
  }

  async function save() {
    setPending(true);
    setNotice("");
    try {
      const { savedPaper } = await savedPaperRequest("", { method: "POST", body: { openAlexId } });
      update(savedPaper, "Paper saved to your reading list.");
    } catch (error) {
      setResult({ owner: user.id, error: error.message });
      if (error.status === 401) sessionExpired();
    } finally {
      setPending(false);
    }
  }

  const current = result?.owner === user?.id ? result : null;
  return (
    <section className="saved-paper-controls" aria-label="Save paper and reading notes">
      <h3>Your reading list</h3>
      {checking ? (
        <p role="status">Checking sign-in status…</p>
      ) : !user ? (
        <p>
          <button type="button" onClick={requestSignIn}>
            Sign in to save this paper
          </button>
        </p>
      ) : !current ? (
        <p role="status">Checking saved paper…</p>
      ) : current.error ? (
        <p role="alert">
          {current.error}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </p>
      ) : current.savedPaper ? (
        <>
          <p>
            <em>Saved.</em> Keep private notes and track your reading below.{" "}
            <a href="/saved-papers">View saved papers</a>.
          </p>
          <SavedPaperEditor
            key={`${user.id}:${current.savedPaper.revision}`}
            savedPaper={current.savedPaper}
            onChange={(item) => update(item, "Reading notes and status saved.")}
            onRemove={() => update(null, "Paper removed from your saved papers.")}
            onReload={() => setAttempt((value) => value + 1)}
          />
        </>
      ) : (
        <p>
          <button type="button" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving…" : "Save paper"}
          </button>
        </p>
      )}
      {notice && (
        <p className="saved-control-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
