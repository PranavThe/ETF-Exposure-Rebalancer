"use client";

import { Fragment, useState } from "react";

import Notice from "@/components/ui/Notice";
import { useOverviews } from "@/lib/hooks";

import { FeaturedBanner, LatestEvents } from "./Hero";
import { FundCard, FundTable } from "./FundCards";
import MoverStrip from "./MoverStrip";
import { SORTS, eventFeed, featuredOf, issuersOf, moversOf, sortOverviews, type SortKey } from "./derive";

const ALL = "All";
const GRID = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[85rem]:grid-cols-4";

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <rect x="2" y="3" width="12" height="2" rx="1" />
      <rect x="2" y="7" width="12" height="2" rx="1" />
      <rect x="2" y="11" width="12" height="2" rx="1" />
    </svg>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="label">{children}</h2>
      {right && <span className="hidden font-mono text-[11px] text-faint sm:inline">{right}</span>}
    </div>
  );
}

function Skeleton() {
  const block = "animate-pulse rounded-xl border border-line bg-panel";
  return (
    <div aria-busy className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className={`${block} h-[360px]`} />
        <div className={`${block} h-[360px]`} />
      </div>
      <div className={`${block} h-14`} />
      <div className={GRID}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-60`} />
        ))}
      </div>
      <p className="sr-only">Loading funds…</p>
    </div>
  );
}

export default function DiscoverBoard() {
  const overviews = useOverviews("full");
  const [issuer, setIssuer] = useState(ALL);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("events");
  const [view, setView] = useState<"grid" | "list">("grid");

  const all = overviews.data ?? [];
  const issuers = issuersOf(all);
  const tabs = [ALL, ...issuers];
  const active = tabs.includes(issuer) ? issuer : ALL;
  const scoped = active === ALL ? all : all.filter((o) => o.fund.issuer === active);
  const q = query.trim().toLowerCase();
  const cards = sortOverviews(
    scoped.filter((o) => !q || o.fund.ticker.toLowerCase().includes(q) || o.fund.name.toLowerCase().includes(q)),
    sort,
  );

  let body: React.ReactNode;
  if (overviews.error) {
    body = (
      <Notice tone="error">
        {overviews.error}
        <span className="mt-1 block text-xs text-muted">Discover reads every fund from the API; reload once it is up.</span>
      </Notice>
    );
  } else if (!overviews.data) {
    body = <Skeleton />;
  } else if (all.length === 0) {
    body = (
      <Notice>
        No funds stored yet. Ingest issuer holdings files with <code className="font-mono text-fg">make demo</code>, then
        reload.
      </Notice>
    );
  } else {
    const featured = featuredOf(scoped);
    const pending = scoped.find((o) => o.holdings);
    const movers = moversOf(scoped);
    body = (
      <div className="space-y-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FeaturedBanner featured={featured} pending={pending} />
          <LatestEvents key={active} feed={eventFeed(scoped)} />
        </div>

        <section>
          <SectionTitle right="largest weight changes · P price · A portfolio activity">Movers</SectionTitle>
          <MoverStrip movers={movers} />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="relative min-w-[12rem] flex-1 sm:max-w-sm">
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="7" cy="7" r="4.5" />
                <path d="m10.5 10.5 3 3" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search loaded funds"
                aria-label="Search loaded funds"
                className="h-9 w-full border-b border-line-2 bg-transparent pl-6 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <span className="font-mono text-[11px] text-faint">
              {cards.length} fund{cards.length === 1 ? "" : "s"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <label className="relative flex h-8 items-center rounded-md border border-line bg-panel pl-2.5 text-sm hover:border-line-2">
                <span className="mr-1.5 text-faint">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Sort funds"
                  className="h-full cursor-pointer appearance-none bg-transparent pr-7 text-fg focus:outline-none"
                >
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id} className="bg-panel-2">
                      {s.label}
                    </option>
                  ))}
                </select>
                <span aria-hidden className="pointer-events-none absolute right-2.5 text-[10px] text-faint">
                  ▼
                </span>
              </label>
              <div role="group" aria-label="View" className="flex h-8 items-center rounded-md border border-line bg-panel p-0.5">
                {(["grid", "list"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    aria-label={v === "grid" ? "Grid view" : "List view"}
                    onClick={() => setView(v)}
                    className={`flex h-full w-8 items-center justify-center rounded ${
                      view === v ? "bg-panel-3 text-fg" : "text-faint hover:text-muted"
                    }`}
                  >
                    {v === "grid" ? <GridIcon /> : <ListIcon />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {cards.length === 0 ? (
            <Notice>No fund matches “{query.trim()}”.</Notice>
          ) : view === "grid" ? (
            <div className={GRID}>
              {cards.map((o) => (
                <FundCard key={o.fund.ticker} o={o} />
              ))}
            </div>
          ) : (
            <FundTable list={cards} />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1920px] px-4 pb-10 lg:px-6">
      <nav aria-label="Issuers" className="flex items-center justify-center gap-3 overflow-x-auto py-5 sm:gap-4 sm:py-6">
        {tabs.map((name, i) => (
          <Fragment key={name}>
            {i > 0 && <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-faint" />}
            <button
              type="button"
              aria-pressed={name === active}
              onClick={() => setIssuer(name)}
              className={`whitespace-nowrap text-lg font-medium tracking-tight transition-colors sm:text-[22px] ${
                name === active ? "text-fg" : "text-fg/40 hover:text-fg/70"
              }`}
            >
              {name}
            </button>
          </Fragment>
        ))}
      </nav>
      {body}
    </div>
  );
}
