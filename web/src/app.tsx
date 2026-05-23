import { useEffect, useState } from "react";

import { Footer, Header } from "./components";
import { loadSiteData, type SiteData } from "./data";
import {
  ArchitecturePage,
  GuidePage,
  HomePage,
  NotFoundPage,
  ReferencePage,
  ResultsPage,
  StatusPage,
} from "./pages";

function routePath(): string {
  const path = window.location.pathname;
  if (path === "/" || path.endsWith("/")) return path;
  return `${path}/`;
}

export function App() {
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = routePath();

  useEffect(() => {
    loadSiteData().then(setData).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "failed to load guide data");
    });
  }, []);

  let page;
  if (error) {
    page = <main className="loading"><strong>data load failed</strong><span>{error}</span></main>;
  } else if (!data) {
    page = <main className="loading" aria-live="polite"><strong>loading reference data</strong></main>;
  } else {
    switch (current) {
      case "/": page = <HomePage data={data} />; break;
      case "/guide/": page = <GuidePage data={data} />; break;
      case "/architecture/": page = <ArchitecturePage />; break;
      case "/results/": page = <ResultsPage data={data} />; break;
      case "/reference-model/": page = <ReferencePage data={data} />; break;
      case "/status/": page = <StatusPage />; break;
      default: page = <NotFoundPage />;
    }
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">skip to content</a>
      <Header current={current} />
      <div id="main-content">{page}</div>
      <Footer />
    </div>
  );
}
