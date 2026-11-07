import { useId, useLayoutEffect, useRef, useState } from "react";
import { authRequest } from "./authRequest.js";
import "./SignOutDialog.css";

export default function SignOutDialog({ onCancel, onSignedOut }) {
  const dialog = useRef(null);
  const headingId = useId();
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function signOut() {
    setPending(true);
    setError("");
    try {
      await authRequest("logout", { body: {} });
      onSignedOut();
    } catch (requestError) {
      setError(requestError.message);
      setPending(false);
    }
  }

  return (
    <dialog
      className="sign-out-dialog"
      ref={dialog}
      role="alertdialog"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClose={onCancel}
      onClick={(event) => {
        if (pending || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onCancel();
      }}
    >
      <h2 id={headingId}>Sign out?</h2>
      <p id={descriptionId}>Are you sure you want to sign out of PaperPulse?</p>
      {error && (
        <p className="sign-out-error" role="alert">
          {error}
        </p>
      )}
      <div className="sign-out-actions">
        <button type="button" disabled={pending} onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" disabled={pending} onClick={() => void signOut()}>
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </dialog>
  );
}
