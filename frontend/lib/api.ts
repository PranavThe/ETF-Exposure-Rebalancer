// Types mirror backend/app/schemas.py. Weights, drifts and effects are fractions (0.07 = 7%).

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Fund = {
  ticker: string;
  name: string;
  issuer: string;
  snapshot_count: number;
  latest_as_of_date: string | null;
};

export type SnapshotMeta = {
  as_of_date: string;
  source_url: string;
  source_file: string;
  content_hash: string;
  row_count: number;
};

export type Snapshot = SnapshotMeta & { ingested_at: string };

export type Health = { status: string; db: string; fund_count: number; snapshot_count: number };

export type HoldingRow = {
  security_id: string;
  ticker: string;
  name: string;
  asset_class: string;
  source_sector: string | null;
  sector: string;
  shares: number;
  price: number | null;
  market_value: number;
  reported_weight: number | null;
};

export type Holdings = { fund: string; snapshot: Snapshot; holdings: HoldingRow[] };

export type FromCfTo = { from: number; cf: number; to: number };

export type Summary = {
  holdings_from: number;
  holdings_to: number;
  added: number;
  removed: number;
  increased: number;
  decreased: number;
  top_n: number;
  top_n_share: FromCfTo;
  hhi: FromCfTo;
};

export type SectorChange = {
  sector: string;
  w_from: number;
  w_cf: number;
  w_to: number;
  drift: number;
  price_effect: number;
  activity_effect: number;
  activity_direct: number;
  activity_dilution: number;
};

export type Status = "ADDED" | "REMOVED" | "INCREASED" | "DECREASED" | "UNCHANGED";

export type HoldingChange = {
  security_id: string;
  ticker: string;
  name: string;
  sector: string;
  status: Status;
  traded: boolean;
  shares_from: number;
  shares_to: number;
  adj_share_change: number | null;
  price_from: number | null;
  price_to: number | null;
  price_estimated: boolean;
  w_from: number;
  w_cf: number;
  w_to: number;
  price_effect: number;
  activity_effect: number;
  flags: string[];
};

export type ChangeEvent = {
  id: string;
  type: string;
  subject: string;
  magnitude: number;
  description: string;
  contributing_security_ids: string[];
};

export type Changes = {
  fund: string;
  config_version: string;
  from: SnapshotMeta;
  to: SnapshotMeta;
  snapshot_intervals: number;
  flow_factor: number;
  cash_weight: { from: number; to: number };
  summary: Summary;
  sectors: SectorChange[];
  holdings: HoldingChange[];
  events: ChangeEvent[];
  caveats: string[];
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

async function sendJson<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown, editKey?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(editKey ? { "X-Portfolio-Edit-Key": editKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(typeof error?.detail === "string" ? error.detail : `API error ${res.status}`);
  }
  return res.status === 204 ? undefined as T : res.json() as Promise<T>;
}

export type PortfolioAllocation = { ticker: string; name: string; issuer: string; weight: number };
export type Portfolio = { id: string; name: string; funds: PortfolioAllocation[]; created_at: string; updated_at: string };
export type PortfolioCreated = Portfolio & { edit_key: string };
export type PortfolioInput = { name: string; funds: { ticker: string; weight: number }[] };
export type PortfolioFundAnalysis = PortfolioAllocation & { status: string; as_of_date: string | null };
export type PortfolioExposure = { security_id: string; ticker: string; name: string; asset_class: string; sector: string; weight: number; funds: string[] };
export type PortfolioAnalysis = {
  portfolio: Portfolio;
  coverage_weight: number;
  analyzed_weight: number;
  newest_as_of_date: string | null;
  funds: PortfolioFundAnalysis[];
  top_exposures: PortfolioExposure[];
  overlap: PortfolioExposure[];
  sectors: { name: string; weight: number }[];
  asset_classes: { name: string; weight: number }[];
  caveats: string[];
};

export const api = {
  health: (signal?: AbortSignal) => getJson<Health>("/health", signal),
  funds: (signal?: AbortSignal) => getJson<Fund[]>("/funds?loaded_only=true&limit=24", signal),
  fund: (ticker: string) => getJson<Fund>(`/funds/${encodeURIComponent(ticker)}`),
  searchEtfs: (q: string, signal?: AbortSignal) => getJson<Fund[]>(`/etfs/search?q=${encodeURIComponent(q)}&limit=20`, signal),
  portfolio: (id: string) => getJson<Portfolio>(`/portfolios/${encodeURIComponent(id)}`),
  portfolioAnalysis: (id: string) => getJson<PortfolioAnalysis>(`/portfolios/${encodeURIComponent(id)}/analysis`),
  createPortfolio: (body: PortfolioInput) => sendJson<PortfolioCreated>("/portfolios", "POST", body),
  updatePortfolio: (id: string, key: string, body: PortfolioInput) => sendJson<Portfolio>(`/portfolios/${encodeURIComponent(id)}`, "PUT", body, key),
  deletePortfolio: (id: string, key: string) => sendJson<void>(`/portfolios/${encodeURIComponent(id)}`, "DELETE", undefined, key),
  snapshots: (ticker: string, signal?: AbortSignal) =>
    getJson<Snapshot[]>(`/funds/${encodeURIComponent(ticker)}/snapshots`, signal),
  changes: (ticker: string, from: string, to: string, signal?: AbortSignal) =>
    getJson<Changes>(
      `/funds/${encodeURIComponent(ticker)}/changes?from=${from}&to=${to}`,
      signal,
    ),
  holdings: (ticker: string, date: string, signal?: AbortSignal) =>
    getJson<Holdings>(`/funds/${encodeURIComponent(ticker)}/holdings?date=${date}`, signal),
};

export const apiDocsUrl = `${API_URL}/docs`;

export function holdingsUrl(ticker: string, date: string): string {
  return `${API_URL}/funds/${encodeURIComponent(ticker)}/holdings?date=${date}`;
}
