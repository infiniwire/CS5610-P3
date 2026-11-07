import { useState } from "react";
import { useReader } from "./ReaderContext.js";
import { savedPaperRequest } from "./savedPaperRequest.js";
import "./PaperSaveButton.css";

export default function PaperSaveButton({ paper, saved, loading, unavailable, onSaved }) {
  const { user, checking, requestSignIn, sessionExpired } = useReader();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!user) {
      requestSignIn();
      return;
    }
    setPending(true);
    setError("");
    try {
      await savedPaperRequest("", { method: "POST", body: { openAlexId: paper.openAlexId } });
      onSaved(paper.openAlexId, user.id);
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status === 401) sessionExpired();
    } finally {
      setPending(false);
    }
  }

  const label = saved
    ? "Saved"
    : pending
      ? "Saving…"
      : loading || checking
        ? "Checking…"
        : "Save paper";
  return (
    <span className="paper-save-action">
      <button
        type="button"
        className="paper-save-button"
        onClick={() => void save()}
        disabled={saved || pending || loading || checking || unavailable}
        aria-label={`${saved ? "Already saved" : "Save paper"}: ${paper.title}`}
        title={
          saved
            ? "In your reading list. Manage notes in Saved papers."
            : "Save to your private reading list"
        }
      >
        {label}
      </button>
      {error && (
        <span className="paper-save-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
