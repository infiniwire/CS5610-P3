import { useEffect, useId, useRef, useState } from "react";
import { useReader } from "./ReaderContext.js";
import "./AccountMenu.css";

const labelStorageKey = "paperpulse.account-label";

function readPreviousLabel() {
  try {
    const label = window.sessionStorage.getItem(labelStorageKey);
    return label === "Account" || label === "Login" ? label : "";
  } catch {
    return "";
  }
}

export default function AccountMenu({ loginOpen, onRequestSignOut }) {
  const { user, checking, requestSignIn } = useReader();
  const [previousLabel] = useState(readPreviousLabel);
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const panelId = useId();
  const path = window.location.pathname.replace(/\/$/, "");
  const accountPage = ["/my-topics", "/saved-papers", "/settings"].includes(path);

  useEffect(() => {
    if (checking) return;
    try {
      // This is only a display hint. Never cache identity or authorize from storage.
      window.sessionStorage.setItem(labelStorageKey, user ? "Account" : "Login");
    } catch {
      // Disabled storage falls back to a neutral, fixed-width placeholder.
    }
  }, [checking, user]);

  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  if (checking && !user)
    return (
      <span className="account-menu-pending" role="status" aria-label="Checking sign-in status">
        <span aria-hidden="true">{previousLabel || "\u00a0"}</span>
      </span>
    );

  if (!user)
    return (
      <button
        type="button"
        className="site-login-button account-login"
        aria-haspopup="dialog"
        aria-controls="login-dialog"
        aria-expanded={loginOpen}
        onClick={requestSignIn}
      >
        Login
      </button>
    );

  return (
    <div
      className="account-menu"
      ref={root}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          trigger.current.focus();
        }
      }}
    >
      <button
        type="button"
        className="site-login-button account-trigger"
        ref={trigger}
        data-active={accountPage}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => panel.current?.querySelector("a")?.focus());
          }
        }}
      >
        Account
      </button>
      <div className="account-dropdown" id={panelId} ref={panel} hidden={!open}>
        <ul aria-label="Account navigation">
          <li>
            <a href="/my-topics" aria-current={path === "/my-topics" ? "page" : undefined}>
              My Topics
            </a>
          </li>
          <li>
            <a href="/saved-papers" aria-current={path === "/saved-papers" ? "page" : undefined}>
              Saved papers
            </a>
          </li>
          <li className="account-menu-separator">
            <a href="/settings" aria-current={path === "/settings" ? "page" : undefined}>
              Settings
            </a>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRequestSignOut();
              }}
            >
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
