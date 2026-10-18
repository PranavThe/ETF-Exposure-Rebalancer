// Shared API basics. The planner's own calls and types live in lib/planner.ts.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Fund = {
  ticker: string;
  name: string;
  issuer: string;
  snapshot_count: number;
  latest_as_of_date: string | null;
};

export type Health = { status: string; db: string; fund_count: number; snapshot_count: number };

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
};

export const apiDocsUrl = `${API_URL}/docs`;
