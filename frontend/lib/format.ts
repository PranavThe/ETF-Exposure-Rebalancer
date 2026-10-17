// The API sends fractions. This is the only place they become % or pp.

const MINUS = "−";

function signed(value: string, negative: boolean, zero: boolean): string {
  if (zero) return value;
  return `${negative ? MINUS : "+"}${value}`;
}

/** A weight difference in percentage points: 0.05 -> "+5.0 pp". */
export function pp(x: number): string {
  const v = Math.round(x * 1000) / 10;
  if (v === 0) return "0.0 pp";
  return `${signed(Math.abs(v).toFixed(1), v < 0, false)} pp`;
}

/** A weight difference with its price / portfolio-activity split. */
export function ppSplit(total: number, price: number, activity: number): string {
  return `${pp(total)} (price ${pp(price)}, portfolio activity ${pp(activity)})`;
}

/** A weight level: 0.07 -> "7.0%". */
export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** A share-count change (not a weight): 0.5 -> "+50.0%". */
export function signedPct(x: number): string {
  const v = Math.round(x * 1000) / 10;
  return `${signed(Math.abs(v).toFixed(1), v < 0, v === 0)}%`;
}

export function shares(x: number): string {
  return x.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function hhi(x: number): string {
  return x.toFixed(4);
}

export function signedHhi(x: number): string {
  const v = Number(x.toFixed(4));
  return signed(Math.abs(v).toFixed(4), v < 0, v === 0);
}

/** Compact dollars: 748681434.8 -> "$748.7M". */
export function money(x: number): string {
  const abs = Math.abs(x);
  const [div, unit] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
  return `${x < 0 ? MINUS : ""}$${(abs / div).toFixed(div === 1 ? 2 : 1)}${unit}`;
}

/** Short date for dense rows: "2026-10-01" -> "Oct 1". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
