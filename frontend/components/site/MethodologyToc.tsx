"use client";

import { useEffect, useState } from "react";

export type TocEntry = { id: string; title: string };

/** Sticky contents list for long articles; highlights the section currently in view. */
export default function MethodologyToc({ entries }: { entries: TocEntry[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          if (r.isIntersecting) visible.set(r.target.id, r.boundingClientRect.top);
          else visible.delete(r.target.id);
        }
        // The topmost section inside the observed band wins.
        const first = entries.find((e) => visible.has(e.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const e of entries) {
      const el = document.getElementById(e.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [entries]);

  return (
    <nav aria-label="On this page">
      <div className="label mb-4">On this page</div>
      <ol className="space-y-0.5">
        {entries.map((e, i) => {
          const on = e.id === active;
          return (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                aria-current={on ? "location" : undefined}
                className={`flex gap-3 border-l py-1.5 pl-3 text-[13px] transition-colors ${
                  on ? "border-accent text-fg" : "border-line text-muted hover:text-fg"
                }`}
              >
                <span className="font-mono text-[11px] leading-5 text-faint">{String(i + 1).padStart(2, "0")}</span>
                {e.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
