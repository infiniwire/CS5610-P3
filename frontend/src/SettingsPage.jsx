import { useReader } from "./ReaderContext.js";
import "./SettingsPage.css";

export default function SettingsPage() {
  const { user, checking, requestSignIn } = useReader();
  return (
    <section className="research-index settings-page" aria-labelledby="settings-heading">
      <div className="index-heading">
        <h1 id="settings-heading">Settings</h1>
      </div>
      {checking ? (
        <p role="status">Checking sign-in status…</p>
      ) : user ? (
        <dl className="settings-account">
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </dl>
      ) : (
        <>
          <p>Sign in to view your account.</p>
          <button type="button" onClick={requestSignIn}>
            Sign in
          </button>
        </>
      )}
    </section>
  );
}
