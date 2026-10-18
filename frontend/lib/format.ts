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

/** A weight level: 0.07 -> "7.0%". */
export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** A distance between two mixes in percentage points, unsigned: 0.05 -> "5.0 pp". */
export function ppDistance(x: number): string {
  return `${(Math.round(Math.abs(x) * 1000) / 10).toFixed(1)} pp`;
}
