"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import BrandLogo from "@/components/BrandLogo";
import { api, apiDocsUrl, type Fund } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useHealth } from "@/lib/hooks";

const LINKS = [
  { href: "/discover", label: "Discover" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/terminal", label: "Terminal" },
  { href: "/fund", label: "Fund" },
  { href: "/movers", label: "Movers" },
];

function FundSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{ term: string; matches: Fund[]; loading: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const currentResult = searchResult?.term === query.trim() ? searchResult : null;
  const matches = currentResult?.matches ?? [];
  const loading = Boolean(q) && (!currentResult || currentResult.loading);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchResult({ term, matches: [], loading: true });
      api.searchEtfs(term, controller.signal).then((funds) => {
        if (!controller.signal.aborted) setSearchResult({ term, matches: funds, loading: false });
      }).catch(() => {
        if (!controller.signal.aborted) setSearchResult({ term, matches: [], loading: false });
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  function go(fund: Fund) {
    setQuery("");
    setOpen(false);
    const ticker = encodeURIComponent(fund.ticker);
    router.push(fund.snapshot_count >= 2 ? `/terminal?fund=${ticker}` : `/fund?fund=${ticker}`);
  }

  return (
    <div className="relative w-full max-w-xl">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) go(matches[0]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search all ETFs"
        aria-label="Search all ETFs"
        className="h-8 w-full rounded-md border border-line bg-panel px-3 text-center text-sm text-fg placeholder:text-faint focus:border-line-2 focus:text-left focus:outline-none"
      />
      {open && q && (
        <ul className="absolute inset-x-0 top-9 z-30 overflow-hidden rounded-md border border-line-2 bg-panel-2 py-1 shadow-xl">
          {loading && matches.length === 0 && <li className="px-3 py-2 text-xs text-muted">Searching the ETF catalog…</li>}
          {!loading && matches.length === 0 && <li className="px-3 py-2 text-xs text-muted">No matching ETFs.</li>}
          {matches.slice(0, 20).map((f) => (
            <li key={f.ticker}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(f)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-panel-3"
              >
                <span>
                  <span className="font-semibold">{f.ticker}</span>{" "}
                  <span className="text-muted">{f.name}</span>
                </span>
                <span className="shrink-0 text-right font-mono text-[10px] text-faint">
                  <span className="block">{f.snapshot_count >= 2 ? "comparison ready" : f.snapshot_count === 1 ? "1 snapshot · pending" : "no holdings yet"}</span>
                  {f.latest_as_of_date && <span className="block">latest {f.latest_as_of_date}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AppNav() {
  const pathname = usePathname();
  const health = useHealth();
  const online = health.data?.status === "ok";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-canvas px-3 sm:gap-4 sm:px-4">
      <Link
        href="/"
        className="inline-flex shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={`${BRAND} home`}
      >
        <BrandLogo width={108} loading="eager" />
      </Link>
      <nav className="flex items-center gap-0.5 overflow-x-auto sm:gap-1">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded px-1.5 py-1 text-[13px] sm:px-2.5 sm:text-sm ${active ? "text-accent" : "text-fg/85 hover:text-fg"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden flex-1 justify-center md:flex">
        <FundSearch />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
        <span className="hidden items-center gap-1.5 text-muted sm:flex" title={health.error ?? "API health"}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              health.loading ? "bg-faint" : online ? "bg-up" : "bg-down"
            }`}
          />
          {health.loading ? "Connecting" : online ? "API online" : "API offline"}
        </span>
        <a
          href={apiDocsUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden rounded-md border border-line px-2.5 py-1 text-muted hover:text-fg sm:block"
        >
          API docs
        </a>
      </div>
    </header>
  );
}
