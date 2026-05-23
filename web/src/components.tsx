import { useMemo, useState, type ReactNode } from "react";

import { calculateBudget, type Profile } from "./budget";

export const routes = [
  ["/", "Home"],
  ["/guide/", "Guide"],
  ["/architecture/", "Architecture"],
  ["/results/", "Results"],
  ["/reference-model/", "Reference model"],
  ["/status/", "Status"],
] as const;

export function Keycap({ children }: { children: ReactNode }) {
  return (
    <span className="keycap">
      <span className="keycap-depth" aria-hidden="true" />
      <span className="keycap-face">
        <span className="keycap-label">{children}</span>
      </span>
    </span>
  );
}

export function KeyLink({ href, children, secondary = false, download }: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  download?: string;
}) {
  return (
    <a
      className={`key-action${secondary ? " key-secondary" : ""}`}
      download={download}
      href={href}
    >
      <Keycap>{children}</Keycap>
    </a>
  );
}

export function Header({ current }: { current: string }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="ESP32 P4 NNUE home">
        <span aria-hidden="true">▦</span>
        <span>ESP32 P4 NNUE</span>
      </a>
      <nav aria-label="Primary navigation">
        {routes.map(([href, label]) => (
          <a
            aria-current={current === href ? "page" : undefined}
            href={href}
            key={href}
          >
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function PageTitle({ index, title, lead }: {
  index: string;
  title: string;
  lead: string;
}) {
  return (
    <header className="page-title">
      <p className="eyebrow">{index}</p>
      <h1>{title}</h1>
      <p>{lead}</p>
    </header>
  );
}

export function Section({ id, index, title, children }: {
  id: string;
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="guide-section" id={id}>
      <header>
        <span>{index}</span>
        <h2>{title}</h2>
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <pre tabIndex={0}>
      <code>{children}</code>
    </pre>
  );
}

export function Notice({ children, pending = false }: {
  children: ReactNode;
  pending?: boolean;
}) {
  return <aside className={`notice${pending ? " pending" : ""}`}>{children}</aside>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function HardwareCalculator({ profiles }: { profiles: Profile[] }) {
  const [bucketCount, setBucketCount] = useState(4);
  const [hiddenWidth, setHiddenWidth] = useState(128);
  const [tableMib, setTableMib] = useState(0.25);
  const budget = useMemo(
    () => calculateBudget(bucketCount, hiddenWidth, tableMib, profiles),
    [bucketCount, hiddenWidth, tableMib, profiles],
  );

  return (
    <div className="calculator">
      <div className="calculator-inputs">
        <label>
          King buckets
          <input
            min="1"
            max="64"
            type="number"
            value={bucketCount}
            onChange={(event) => setBucketCount(Number(event.target.value))}
          />
        </label>
        <label>
          Hidden width
          <input
            min="1"
            max="512"
            type="number"
            value={hiddenWidth}
            onChange={(event) => setHiddenWidth(Number(event.target.value))}
          />
        </label>
        <label>
          Table MiB
          <input
            min="0"
            max="256"
            step="0.25"
            type="number"
            value={tableMib}
            onChange={(event) => setTableMib(Number(event.target.value))}
          />
        </label>
      </div>
      <output aria-live="polite" className="budget-output">
        <Stat label="serialized NNUE" value={`${budget.modelBytes.toLocaleString()} B`} />
        <Stat label="accumulators" value={`${budget.accumulatorBytes.toLocaleString()} B`} />
        <Stat label="transposition table" value={`${budget.transpositionBytes.toLocaleString()} B`} />
        <Stat label="known profile" value={budget.compatibleProfile ?? "custom unsupported"} />
        <Stat label="512 KiB ceiling" value={budget.withinModelCeiling ? "fits" : "exceeds"} />
      </output>
      <p className="formula">32 + 6H + 640BH model bytes · 4H accumulator bytes</p>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <span>stage one embedded nnue</span>
      <a href="https://github.com/ishanrk/esp32p4-nnue">source on github</a>
    </footer>
  );
}
