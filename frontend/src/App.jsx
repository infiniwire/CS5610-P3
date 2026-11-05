import { useLayoutEffect, useRef } from "react";
import AuthPanel from "./AuthPanel.jsx";
import PaperIndex from "./PaperIndex.jsx";
import ReportPage from "./ReportPage.jsx";
import "./App.css";

export default function App() {
  const isPapersPage = /^\/papers\/?$/i.test(window.location.pathname);
  const accountMenu = useRef(null);
  const accountToggle = useRef(null);
  const reportDocument = useRef(null);

  useLayoutEffect(() => {
    const report = reportDocument.current;
    if (!report) return;
    const sheet = report.querySelector(".report-sheet");

    function updateScale() {
      report.style.setProperty("--sheet-scale", report.getBoundingClientRect().width / sheet.offsetWidth);
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(report);
    return () => observer.disconnect();
  }, []);

  function openAccount(event) {
    event.preventDefault();
    accountMenu.current.open = true;
    accountToggle.current.focus();
  }

  const masthead = (
    <header className="site-masthead">
      <a className="site-wordmark" href="/">PaperPulse</a>
      <nav aria-label="Site navigation">
        <a href="/" aria-current={isPapersPage ? undefined : "page"}>Home</a>
        <a href="/papers" aria-current={isPapersPage ? "page" : undefined}>Papers</a>
        <details
          className="account-menu"
          id="account"
          ref={accountMenu}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !event.currentTarget.open) return;
            event.preventDefault();
            event.currentTarget.open = false;
            accountToggle.current.focus();
          }}
        >
          <summary ref={accountToggle}>Account</summary>
          <div className="account-menu-panel">
            <AuthPanel />
          </div>
        </details>
      </nav>
    </header>
  );

  if (isPapersPage) {
    return (
      <main className="paper-browser" id="top">
        {masthead}
        <PaperIndex />
        <footer className="site-footer">
          <span>PaperPulse · 2026</span>
          <a href="#top">Back to top</a>
        </footer>
      </main>
    );
  }

  return (
    <main className="paper-browser report-document" id="top" ref={reportDocument}>
      {masthead}
      <ReportPage number={1}>
        <header className="report-title">
          <h1>PaperPulse</h1>
          <p className="report-subtitle">A Research Index for U.S. and Canadian Universities</p>
          <p className="report-edition">2026 Edition</p>
        </header>

        <p className="report-abstract" id="abstract">
          <span>Abstract.</span> PaperPulse indexes work published in 2026 by researchers affiliated
          with U.S. and Canadian universities. We use OpenAlex data to organize publications by
          institution, publication month, and citation count.
        </p>

        <section className="report-section" aria-labelledby="introduction-heading">
          <h2 id="introduction-heading">1. Introduction</h2>
          <p>
            The <a href="/papers">paper index</a> lets readers browse 2026 publications by
            university and publication month. Each entry lists the authors, institutional
            affiliations, publication date, and citation count, and links to its source record
            in OpenAlex <a className="report-citation" href="#ref-openalex">[1]</a>.
          </p>
        </section>

        <section className="report-section" aria-labelledby="account-section-heading">
          <h2 id="account-section-heading">2. User Login</h2>
          <p>Use the <a href="#account" onClick={openAccount}>Account menu</a> to sign in or create an account.</p>
        </section>

        <section className="report-section" aria-labelledby="goal-heading">
          <h2 id="goal-heading">3. Our goal</h2>
          <p>
            Our goal is to make university research easier to discover and compare. A reader can
            start with a particular institution and time period, then consult individual papers
            or repeat the search for another institution.
          </p>
        </section>

        <section className="report-footer" aria-labelledby="references-heading">
          <h2 id="references-heading">References</h2>
          <p id="ref-openalex">[1] OpenAlex. <a href="https://openalex.org/"><em>OpenAlex scholarly index</em></a>.</p>
        </section>
      </ReportPage>
    </main>
  );
}
