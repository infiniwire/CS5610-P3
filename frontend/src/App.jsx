import { useCallback, useLayoutEffect, useRef, useState } from "react";
import AuthDialog from "./AuthDialog.jsx";

import DatasetAnalysis from "./DatasetAnalysis.jsx";
import PaperIndex from "./PaperIndex.jsx";
import AnalysisPage from "./AnalysisPage.jsx";
import RankingsPage from "./RankingsPage.jsx";
import ReportPage from "./ReportPage.jsx";
import ProjectFooter from "./ProjectFooter.jsx";

import { ReaderContext } from "./ReaderContext.js";
import "./App.css";

export default function App() {
  const isPapersPage = /^\/papers\/?$/i.test(window.location.pathname);
  const isAnalysisPage = /^\/analysis\/?$/i.test(window.location.pathname);
  const isRankingsPage = /^\/rankings\/?$/i.test(window.location.pathname);

  const isIndexPage = isPapersPage || isAnalysisPage || isRankingsPage;
  const [loginOpen, setLoginOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const reportDocument = useRef(null);
  const userChanged = useCallback((user) => {
    setCurrentUser(user);
    setAuthChecking(false);
  }, []);
  const requestSignIn = useCallback(() => setLoginOpen(true), []);
  const sessionExpired = useCallback(() => {
    setCurrentUser(null);
    setAuthChecking(false);
    setLoginOpen(true);
  }, []);
  const reader = { user: currentUser, checking: authChecking, requestSignIn, sessionExpired };

  useLayoutEffect(() => {
    const report = reportDocument.current;
    if (!report || isIndexPage) return;
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
  }, [isIndexPage]);

  const masthead = (
    <>
      <header className="site-masthead">
        <a className="site-wordmark" href="/">
          PaperPulse
        </a>
        <nav aria-label="Site navigation">
          <a href="/" aria-current={isIndexPage ? undefined : "page"}>
            Home
          </a>
          <a href="/papers" aria-current={isPapersPage ? "page" : undefined}>
            Papers
          </a>
          <a href="/analysis" aria-current={isAnalysisPage ? "page" : undefined}>
            Analysis
          </a>
          <a href="/rankings" aria-current={isRankingsPage ? "page" : undefined}>
            Rankings
          </a>
          <button
            type="button"
            className="site-login-button"
            aria-haspopup="dialog"
            aria-controls="login-dialog"
            aria-expanded={loginOpen}
            onClick={() => setLoginOpen(true)}
          >
            {currentUser ? "Account" : "Login"}
          </button>
        </nav>
      </header>
      <AuthDialog open={loginOpen} onClose={() => setLoginOpen(false)} onUserChange={userChanged} />
    </>
  );

  if (isIndexPage) {
    return (
      <ReaderContext.Provider value={reader}>
        <main className={`paper-browser${isAnalysisPage ? " analysis-document" : ""}`} id="top">
          {masthead}
          {isAnalysisPage ? <AnalysisPage /> : isRankingsPage ? <RankingsPage /> : <PaperIndex />}
          <footer className="site-footer">
            <span>PaperPulse · 2026</span>
            <a href="#top">Back to top</a>
          </footer>
        </main>
        <ProjectFooter />
      </ReaderContext.Provider>
    );
  }

  return (
    <ReaderContext.Provider value={reader}>
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
              <a href="/papers">paper index</a> by title, author, topic, university, or month, and
              select a title for details. Explore publication patterns in{" "}
              <a href="/analysis">Analysis</a> and compare papers, universities, authors, and topics
              in <a href="/rankings">Rankings</a>, using OpenAlex records{" "}
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
    </ReaderContext.Provider>
  );
}
