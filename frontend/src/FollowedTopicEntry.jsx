import { useState } from "react";
import { useReader } from "./ReaderContext.js";
import { shortTopicId, topicRequest } from "./topicRequest.js";
import "./FollowedTopicEntry.css";

export default function FollowedTopicEntry({ item, onChange, onRemove, onReload }) {
  const { sessionExpired } = useReader();
  const [note, setNote] = useState(item.note);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(null);
  async function mutate(action) {
    setPending(true);
    setError(null);
    try {
      const path = `followed-topics/${shortTopicId(item.topicId)}${action === "check" ? "/check" : ""}`;
      const data = await topicRequest(path, {
        method: action === "remove" ? "DELETE" : action === "check" ? "POST" : "PATCH",
        body:
          action === "check"
            ? {}
            : { revision: item.revision, ...(action === "note" ? { note } : {}) },
      });
      if (action === "remove") onRemove(item.topicId);
      else onChange(data.followedTopic);
    } catch (error) {
      setError(error);
      if (error.status === 401) sessionExpired();
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="followed-topic-entry">
      <h3>{item.name}</h3>
      <p className="topic-check-time">
        {item.topicId.split("/").at(-1)} · Last checked:{" "}
        {item.lastCheckedAt
          ? new Date(item.lastCheckedAt).toLocaleString("en-US")
          : "Not yet checked"}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutate("note");
        }}
      >
        <label>
          Personal note for {item.name}
          <textarea
            maxLength={2000}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
          />
        </label>
        <div className="topic-actions">
          <button type="submit" disabled={pending || note === item.note}>
            Save note
          </button>
          <button type="button" disabled={pending} onClick={() => void mutate("check")}>
            Mark as checked
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirm(true)}>
            Unfollow
          </button>
        </div>
      </form>
      {confirm && (
        <div role="group" aria-label={`Confirm unfollow ${item.name}`}>
          <p>Unfollow this topic and remove its personal note?</p>
          <button type="button" disabled={pending} onClick={() => void mutate("remove")}>
            Confirm unfollow
          </button>{" "}
          <button type="button" disabled={pending} onClick={() => setConfirm(false)}>
            Keep topic
          </button>
        </div>
      )}
      {pending && <p role="status">Saving changes…</p>}
      {error && (
        <p role="alert">
          {error.message}{" "}
          {[404, 409].includes(error.status) && (
            <button type="button" onClick={onReload}>
              Reload followed topics
            </button>
          )}
        </p>
      )}
    </article>
  );
}
