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

export const api = {
  funds: (signal?: AbortSignal) => getJson<Fund[]>("/funds", signal),
  snapshots: (ticker: string, signal?: AbortSignal) =>
    getJson<Snapshot[]>(`/funds/${encodeURIComponent(ticker)}/snapshots`, signal),
  changes: (ticker: string, from: string, to: string, signal?: AbortSignal) =>
    getJson<Changes>(
      `/funds/${encodeURIComponent(ticker)}/changes?from=${from}&to=${to}`,
      signal,
    ),
};

export function holdingsUrl(ticker: string, date: string): string {
  return `${API_URL}/funds/${encodeURIComponent(ticker)}/holdings?date=${date}`;
}
