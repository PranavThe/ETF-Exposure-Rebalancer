// The planner's API calls, saved-portfolio storage and sector helpers.
// Weights are fractions (0.07 = 7%); amounts are dollars.

import { API_URL, api, type Fund } from "@/lib/api";

export type SectorWeight = { sector: string; weight: number };

export type CoveredEtf = {
  ticker: string;
  name: string;
  issuer: string;
  as_of_date: string;
  sample: boolean;
  sectors: SectorWeight[];
};

export type PlanFund = {
  ticker: string;
  name: string;
  issuer: string;
  amount: number;
  status: "available" | "missing";
  as_of_date: string | null;
  sectors: SectorWeight[];
};

export type MoveAction = "add" | "increase" | "reduce" | "remove";
export type Move = { ticker: string; name: string; action: MoveAction; amount: number; before: number; after: number };

export type Plan = {
  kind: string;
  title: string;
  summary: string;
  total_before: number;
  total_after: number;
  distance: number;
  exposure: SectorWeight[];
  moves: Move[];
  new_funds: string[];
};

export type PlanResult = {
  total: number;
  covered_total: number;
  funds: PlanFund[];
  current: SectorWeight[];
  target: SectorWeight[] | null;
  distance: number | null;
  plans: Plan[];
};

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatReply = {
  reply: string;
  target: Record<string, number> | null;
  cash_change: number | null;
  source: "claude" | "rules";
};

export type Holding = { ticker: string; name: string; amount: number };
export type Mix = Record<string, number>;

export const SECTORS = [
  "Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Communication Services",
  "Industrials",
  "Energy",
  "Utilities",
  "Materials",
  "Real Estate",
  "Cash & other",
] as const;
export const UNCLASSIFIED = "Unclassified";

// Categorical palette validated for colour-vision separation on the dark panel surface.
const PALETTE = [
  "#7a73f0", "#c98500", "#2aaa9a", "#d36a85", "#699ee0", "#a0a64c",
  "#ac77d4", "#d17f59", "#4fbaa9", "#c2a65e", "#7b9ed0", "#8a8a96",
];
export function sectorColor(sector: string): string {
  const i = (SECTORS as readonly string[]).indexOf(sector);
  return i >= 0 ? PALETTE[i] : "#55555e";
}

export function toMix(list: SectorWeight[] | null | undefined): Mix {
  const out: Mix = {};
  for (const s of list ?? []) out[s.sector] = s.weight;
  return out;
}

/** Half the summed absolute difference between two mixes: how far apart they are, as a fraction. */
export function mixDistance(a: Mix, b: Mix): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum / 2;
}

/**
 * Set one sector of a target mix and keep the total at 100%.
 * The difference is spread over the sectors the user hasn't set yet, in proportion to their size;
 * if those are all empty, over every other sector.
 */
export function setSector(mix: Mix, sector: string, value: number, touched: Set<string>): Mix {
  const v = Math.min(1, Math.max(0, value));
  const others = SECTORS.filter((s) => s !== sector);
  const free = others.filter((s) => !touched.has(s));
  const sumOf = (list: readonly string[]) => list.reduce((acc, s) => acc + (mix[s] ?? 0), 0);
  const out: Mix = { [sector]: v };
  // Sectors the user already set keep their value when they still fit next to this one.
  let pool: readonly string[] = free;
  const fixed = others.filter((s) => touched.has(s));
  if (sumOf(fixed) + v > 1 + 1e-9 || free.length === 0) pool = others;
  else for (const s of fixed) out[s] = mix[s] ?? 0;
  const remaining = Math.max(0, 1 - v - (pool === others ? 0 : sumOf(fixed)));
  const poolSum = sumOf(pool);
  for (const s of pool) out[s] = poolSum > 1e-12 ? ((mix[s] ?? 0) * remaining) / poolSum : remaining / pool.length;
  return out;
}

/** A current mix as a starting target: the 12 target sectors only, rescaled to 100%. */
export function targetFrom(mix: Mix): Mix {
  const out: Mix = {};
  let sum = 0;
  for (const s of SECTORS) sum += mix[s] ?? 0;
  for (const s of SECTORS) out[s] = sum > 0 ? (mix[s] ?? 0) / sum : 1 / SECTORS.length;
  return out;
}

export function usd(x: number, cents = false): string {
  return `${x < 0 ? "−" : ""}$${Math.abs(x).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

// ---- API -----------------------------------------------------------------------------------

async function call<T>(path: string, init?: RequestInit & { editKey?: string }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.editKey ? { "X-Portfolio-Edit-Key": init.editKey } : {}),
      },
    });
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : `Server error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type PlanRequest = {
  holdings: { ticker: string; amount: number }[];
  target: Mix | null;
  cash_change: number;
  max_new_funds: number;
};

export const planner = {
  covered: () => call<CoveredEtf[]>("/etfs/covered"),
  search: (q: string, signal?: AbortSignal): Promise<Fund[]> => api.searchEtfs(q, signal),
  plan: (body: PlanRequest, signal?: AbortSignal) =>
    call<PlanResult>("/plan", { method: "POST", body: JSON.stringify(body), signal }),
  chat: (body: { message: string; history: ChatTurn[]; current: Mix; target: Mix | null; total: number }) =>
    call<ChatReply>("/chat", { method: "POST", body: JSON.stringify(body) }),
};

// ---- Saving: an anonymous portfolio (weights) plus its dollar value and target ---------------

type Saved = { id: string; key: string | null };
const KEYS = "planner:edit-keys";
const LAST = "planner:last";

function readKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberedPortfolio(requested: string | null): Saved | null {
  try {
    const id = requested ?? localStorage.getItem(LAST);
    if (!id) return null;
    return { id, key: readKeys()[id] ?? null };
  } catch {
    return requested ? { id: requested, key: null } : null;
  }
}

function remember(id: string, key: string) {
  try {
    localStorage.setItem(KEYS, JSON.stringify({ ...readKeys(), [id]: key }));
    localStorage.setItem(LAST, id);
  } catch {
    // storage blocked: the link still works for viewing
  }
}

export function forgetLast() {
  try {
    localStorage.removeItem(LAST);
  } catch {
    // ignore
  }
}

type Preferences = { total_value: number | null; target: Mix | null };

export async function loadPortfolio(id: string): Promise<{ holdings: Holding[]; target: Mix | null }> {
  const [portfolio, prefs] = await Promise.all([
    call<{ funds: { ticker: string; name: string; weight: number }[] }>(`/portfolios/${encodeURIComponent(id)}`),
    call<Preferences>(`/portfolios/${encodeURIComponent(id)}/preferences`),
  ]);
  const total = prefs.total_value ?? 10000;
  return {
    holdings: portfolio.funds
      .map((f) => ({ ticker: f.ticker, name: f.name, amount: Math.round(f.weight * total * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount),
    target: prefs.target,
  };
}

/** Create or update the saved portfolio; returns where it now lives. */
export async function savePortfolio(saved: Saved | null, holdings: Holding[], target: Mix | null): Promise<Saved> {
  const kept = holdings.filter((h) => h.amount > 0);
  const total = kept.reduce((a, h) => a + h.amount, 0);
  const weights = kept.map((h) => h.amount / total);
  // The API wants weights summing to exactly 1: give the rounding residue to the last one.
  if (weights.length) weights[weights.length - 1] = 1 - weights.slice(0, -1).reduce((a, w) => a + w, 0);
  const body = JSON.stringify({ name: "My ETFs", funds: kept.map((h, i) => ({ ticker: h.ticker, weight: weights[i] })) });
  let place = saved;
  if (place?.key) {
    await call(`/portfolios/${encodeURIComponent(place.id)}`, { method: "PUT", body, editKey: place.key });
  } else {
    const created = await call<{ id: string; edit_key: string }>("/portfolios", { method: "POST", body });
    place = { id: created.id, key: created.edit_key };
    remember(place.id, created.edit_key);
  }
  await call(`/portfolios/${encodeURIComponent(place.id)}/preferences`, {
    method: "PUT",
    body: JSON.stringify({ total_value: total, target }),
    editKey: place.key ?? undefined,
  });
  return place;
}
