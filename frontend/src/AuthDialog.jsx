import { useId, useLayoutEffect, useRef } from "react";
import AuthPanel from "./AuthPanel.jsx";
import "./AuthDialog.css";

export default function AuthDialog({ open, onClose, onUserChange }) {
  const dialog = useRef(null);
  const headingId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    element.querySelector("input")?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeDialog() {
    onClose();
    dialog.current.close();
  }

  return (
    <dialog
      id="login-dialog"
      className="auth-dialog"
      ref={dialog}
      aria-labelledby={headingId}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          closeDialog();
      }}
    >
      <button type="button" className="auth-dialog-close" onClick={closeDialog}>
        Close
      </button>
      <AuthPanel
        headingId={headingId}
        open={open}
        onUserChange={onUserChange}
        onSignedIn={closeDialog}
      />
    </dialog>
  );
}
