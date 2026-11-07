import { useId, useState } from "react";
import { useReader } from "./ReaderContext.js";
import { readingStatuses, savedPaperPath, savedPaperRequest } from "./savedPaperRequest.js";
import "./SavedPaperEditor.css";

export default function SavedPaperEditor({ savedPaper, onChange, onRemove, onReload }) {
  const { sessionExpired } = useReader();
  const hintId = useId();
  const [notes, setNotes] = useState(savedPaper.notes);
  const [status, setStatus] = useState(savedPaper.readingStatus);
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState(null);
  const changed = notes !== savedPaper.notes || status !== savedPaper.readingStatus;

  async function mutate(remove) {
    setPending(true);
    setError(null);
    try {
      const data = await savedPaperRequest(savedPaperPath(savedPaper.openAlexId), {
        method: remove ? "DELETE" : "PATCH",
        body: {
          revision: savedPaper.revision,
          ...(remove ? {} : { notes, readingStatus: status }),
        },
      });
      if (remove) onRemove();
      else onChange(data.savedPaper);
    } catch (requestError) {
      setError(requestError);
      if (requestError.status === 401) sessionExpired();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="saved-paper-editor">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutate(false);
        }}
        aria-label="Edit saved paper"
      >
        <fieldset disabled={pending}>
          <label>
            Reading status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(readingStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={10000}
              rows={4}
              aria-describedby={hintId}
              placeholder="Your observations, questions, and reading notes…"
            />
          </label>
          <p className="saved-editor-hint" id={hintId}>
            Private notes · {notes.length.toLocaleString("en")} / 10,000 characters
          </p>
          <div className="saved-editor-actions">
            <button type="submit" disabled={pending || !changed}>
              {pending ? "Please wait…" : "Save changes"}
            </button>
            {!confirmRemove && (
              <button
                type="button"
                className="saved-remove-button"
                onClick={() => setConfirmRemove(true)}
              >
                Remove from saved papers
              </button>
            )}
          </div>
          {changed && <p className="saved-editor-hint">You have unsaved changes.</p>}
        </fieldset>
      </form>
      {confirmRemove && (
        <div className="saved-remove-confirm" role="group" aria-label="Confirm removal">
          <p>Remove this saved paper and its notes?</p>
          <button type="button" disabled={pending} onClick={() => void mutate(true)}>
            Remove paper and notes
          </button>{" "}
          <button type="button" disabled={pending} onClick={() => setConfirmRemove(false)}>
            Keep paper
          </button>
        </div>
      )}
      {error && (
        <p className="saved-editor-error" role="alert">
          {error.message}{" "}
          {[404, 409].includes(error.status) && (
            <button type="button" disabled={pending} onClick={onReload}>
              Reload saved paper
            </button>
          )}
        </p>
      )}
    </div>
  );
}
