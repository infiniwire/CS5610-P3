import ProjectFooter from "./ProjectFooter.jsx";
import { useLayoutEffect, useRef } from "react";
import AuthPanel from "./AuthPanel.jsx";
import DatasetAnalysis from "./DatasetAnalysis.jsx";
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
      report.style.setProperty(
        "--sheet-scale",
        report.getBoundingClientRect().width / sheet.offsetWidth,
      );
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(report);
    return () => observer.disconnect();
  }, []);

  const masthead = (
    <header className="site-masthead">
      <a className="site-wordmark" href="/">
        PaperPulse
      </a>
      <nav aria-label="Site navigation">
        <a href="/" aria-current={isPapersPage ? undefined : "page"}>
          Home
        </a>
        <a href="/papers" aria-current={isPapersPage ? "page" : undefined}>
          Papers
        </a>
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
      <>
        <main className="paper-browser" id="top">
          {masthead}
          <PaperIndex />
          <footer className="site-footer">
            <span>PaperPulse · 2026</span>
            <a href="#top">Back to top</a>
          </footer>
        </main>
        <ProjectFooter />
      </>
    );
  }

  return (
    <>
      <main className="paper-browser report-document" id="top" ref={reportDocument}>
        {masthead}
        <ReportPage number={1}>
          <header className="report-title">
            <h1>PaperPulse</h1>
            <p className="report-subtitle">A Research Index for U.S. and Canadian Universities</p>
            <p className="report-edition">2026 Edition</p>
          </header>

          <p className="report-abstract" id="abstract">
            <span>Abstract.</span> PaperPulse uses OpenAlex records to explore 2026 research from
            U.S. and Canadian universities by institution, topic, publication date, and citations.
          </p>

          <section className="report-section" aria-labelledby="introduction-heading">
            <h2 id="introduction-heading">1. Introduction and goal</h2>
            <p>
              Our goal is to make university research easier to discover and compare. Browse the{" "}
              <a href="/papers">paper index</a> by university or month, using OpenAlex records{" "}
              <a className="report-citation" href="#ref-openalex">
                [1]
              </a>
              .
            </p>
          </section>

          <DatasetAnalysis />
        </ReportPage>
      </main>
      <ProjectFooter />
    </>
  );
}
