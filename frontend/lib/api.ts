// Shared API basics. Planner-specific calls and types live in lib/planner.ts.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Fund = {
  ticker: string;
  name: string;
  issuer: string;
  snapshot_count: number;
  latest_as_of_date: string | null;
  provider_holdings_as_of_date?: string | null;
};

export type Health = { status: string; db: string; fund_count: number; snapshot_count: number };

export type ProviderHolding = { ticker: string; weight: number };
export type ProviderHoldingChange = { ticker: string; weight?: number; previous_weight?: number; change?: number };
export type ProviderHoldingChanges = {
  fund: string;
  provider: string;
  name: string;
  snapshot: {
    as_of_date: string;
    source_layer: string;
    source_url: string;
    cite_as: string;
    fetched_at: string;
    content_hash: string;
  };
  previous_as_of_date: string | null;
  holdings: ProviderHolding[];
  entered: ProviderHoldingChange[];
  no_longer_reported: ProviderHoldingChange[];
  changed_weights: ProviderHoldingChange[];
  change_note: string;
};

export type ProviderPrice = {
  ticker: string;
  as_of_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  fetched_at: string;
};

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(`Could not reach the API at ${API_URL}. Is it running? Start it with "make api".`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep statusText
    }
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: (signal?: AbortSignal) => getJson<Health>("/health", signal),
  searchEtfs: (q: string, signal?: AbortSignal) =>
    getJson<Fund[]>(`/etfs/search?q=${encodeURIComponent(q)}&limit=20`, signal),
  providerHoldingChanges: (ticker: string, signal?: AbortSignal) =>
    getJson<ProviderHoldingChanges>(`/provider-data/funds/${encodeURIComponent(ticker)}/holdings`, signal),
  providerPrices: (symbols: string[], signal?: AbortSignal) =>
    getJson<{ provider: "alpaca"; feed: "iex"; adjustment: "all"; prices: ProviderPrice[] }>(
      `/provider-data/prices?symbols=${encodeURIComponent(symbols.join(","))}`,
      signal,
    ),
};

export const apiDocsUrl = `${API_URL}/docs`;
