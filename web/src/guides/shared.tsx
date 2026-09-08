import { useEffect, type ReactNode } from "react";
export function Page({title, children}: {title:string;children:ReactNode}) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [title]);
  return <main className="guide-page" id="guide-content" tabIndex={-1}><header className="guide-intro"><h1>{title}</h1></header>{children}</main>;
}
export function Section({title, children, id}: {title:string;children:ReactNode;id?:string}) {
  return <section className="guide-section" id={id}><h2>{title}</h2>{children}</section>;
}
export function Code({children}: {children:string}) { return <pre tabIndex={0}><code>{children}</code></pre>; }

export function Source({path, children}: {path:string;children?:ReactNode}) {
  return <a href={`https://github.com/ishanrk/esp32p4-nnue/blob/main/${path}`}>{children ?? <code>{path}</code>}</a>;
}
