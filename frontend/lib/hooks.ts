"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type Changes, type Fund, type Holdings, type Snapshot } from "./api";

// Responses are cached for the page session so moving between pages doesn't refetch.
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let promise = cache.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = fetcher();
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}

export const load = {
  funds: () => cached("funds", () => api.funds()),
  snapshots: (ticker: string) => cached(`snapshots:${ticker}`, () => api.snapshots(ticker)),
  changes: (ticker: string, from: string, to: string) =>
    cached(`changes:${ticker}:${from}:${to}`, () => api.changes(ticker, from, to)),
  holdings: (ticker: string, date: string) =>
    cached(`holdings:${ticker}:${date}`, () => api.holdings(ticker, date)),
};

export type Resource<T> = { data?: T; error?: string; loading: boolean };

/** Runs `fetcher` whenever `key` changes; a null key means "nothing to load yet". */
export function useResource<T>(key: string | null, fetcher: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    fetcher().then(
      (data) => active && setState({ key, data }),
      (err: Error) => active && setState({ key, error: err.message }),
    );
    return () => {
      active = false;
    };
    // The key identifies the request; fetcher is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = state && state.key === key ? state : null;
  return { data: current?.data, error: current?.error, loading: key !== null && current === null };
}

export function useFunds(): Resource<Fund[]> {
  return useResource("funds", load.funds);
}

export function useFund(ticker: string | null): Resource<Fund> {
  return useResource(ticker, () => api.fund(ticker!));
}

export function useHealth() {
  return useResource("health", () => api.health());
}

export function useSnapshots(ticker: string | null): Resource<Snapshot[]> {
  return useResource(ticker, () => load.snapshots(ticker!));
}

export function useChanges(ticker: string | null, from: string | null, to: string | null): Resource<Changes> {
  const key = ticker && from && to ? `${ticker}|${from}|${to}` : null;
  return useResource(key, () => load.changes(ticker!, from!, to!));
}

export function useHoldings(ticker: string | null, date: string | null): Resource<Holdings> {
  const key = ticker && date ? `${ticker}|${date}` : null;
  return useResource(key, () => load.holdings(ticker!, date!));
}

/** One fund with its snapshots and either its widest comparison or, with one snapshot, its holdings. */
export type FundOverview = {
  fund: Fund;
  snapshots: Snapshot[];
  changes?: Changes;
  holdings?: Holdings;
};

export type RangeKind = "full" | "latest";

export function rangeOf(snapshots: Snapshot[], kind: RangeKind): { from: string; to: string } | null {
  if (snapshots.length < 2) return null;
  const last = snapshots[snapshots.length - 1].as_of_date;
  const from = kind === "full" ? snapshots[0].as_of_date : snapshots[snapshots.length - 2].as_of_date;
  return { from, to: last };
}

async function loadOverviews(kind: RangeKind): Promise<FundOverview[]> {
  const funds = await load.funds();
  return Promise.all(
    funds.map(async (fund) => {
      const snapshots = await load.snapshots(fund.ticker);
      const range = rangeOf(snapshots, kind);
      if (range) return { fund, snapshots, changes: await load.changes(fund.ticker, range.from, range.to) };
      if (snapshots.length === 1) {
        return { fund, snapshots, holdings: await load.holdings(fund.ticker, snapshots[0].as_of_date) };
      }
      return { fund, snapshots };
    }),
  );
}

export function useOverviews(kind: RangeKind = "full"): Resource<FundOverview[]> {
  return useResource(`overviews:${kind}`, () => loadOverviews(kind));
}

/**
 * Page state kept in the URL (?fund=&from=&to=), so every view is a shareable link.
 * Updates use history.replaceState, which Next.js syncs with useSearchParams without a reload.
 * Components using this must sit inside a <Suspense> boundary.
 */
export function useQueryState() {
  const params = useSearchParams();
  const pathname = usePathname();
  return {
    get: (key: string) => params.get(key) ?? undefined,
    set(updates: Record<string, string | undefined>) {
      // Start from the live URL, not this render's params, so back-to-back updates both apply.
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
  };
}

/** The requested fund if it exists, otherwise the first fund that can be compared. */
export function pickFund(funds: Fund[], requested?: string): string {
  const wanted = requested?.toUpperCase();
  const comparable = funds.filter((f) => f.snapshot_count >= 2);
  return (
    funds.find((f) => f.ticker === wanted)?.ticker ??
    comparable[0]?.ticker ??
    funds[0]?.ticker ??
    ""
  );
}

/** The requested range if both dates are stored snapshots in order, else the widest range. */
export function pickRange(snapshots: Snapshot[], from?: string, to?: string): { from: string; to: string } | null {
  const dates = snapshots.map((s) => s.as_of_date);
  if (from && to && from < to && dates.includes(from) && dates.includes(to)) return { from, to };
  return rangeOf(snapshots, "full");
}

export function terminalHref(fund: string, from?: string, to?: string): string {
  return from && to ? `/terminal?fund=${fund}&from=${from}&to=${to}` : `/terminal?fund=${fund}`;
}
