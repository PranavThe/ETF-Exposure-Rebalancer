import type { Changes } from "./api";
import { pp, pct } from "./format";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Download a self-contained, print-friendly report for the current comparison. */
export function downloadComparisonReport(data: Changes) {
  const positions = [...data.holdings].filter((row) => row.status !== "UNCHANGED" || row.traded)
    .sort((a, b) => Math.abs(b.w_to - b.w_from) - Math.abs(a.w_to - a.w_from)).slice(0, 30);
  const sectors = [...data.sectors].sort((a, b) => b.w_to - a.w_to);
  const sourceRows = [data.from, data.to].map((snapshot, index) => `
    <tr><td>${index === 0 ? "Starting snapshot" : "Ending snapshot"}</td><td>${escapeHtml(snapshot.as_of_date)}</td><td><a href="${escapeHtml(snapshot.source_url)}">${escapeHtml(snapshot.source_file)}</a></td><td><code>${escapeHtml(snapshot.content_hash)}</code></td></tr>`).join("");
  const positionRows = positions.map((row) => `<tr><td>${escapeHtml(row.ticker || row.name)}</td><td>${escapeHtml(row.sector)}</td><td>${escapeHtml(row.status)}</td><td>${pct(row.w_from)}</td><td>${pct(row.w_to)}</td><td>${pp(row.w_to - row.w_from)}</td></tr>`).join("");
  const sectorRows = sectors.map((row) => `<tr><td>${escapeHtml(row.sector)}</td><td>${pct(row.w_from)}</td><td>${pct(row.w_cf)}</td><td>${pct(row.w_to)}</td><td>${pp(row.drift)}</td></tr>`).join("");
  const caveats = data.caveats.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(data.fund)} holdings comparison</title><style>
    :root{color-scheme:light;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20212a;background:#fff}body{max-width:1100px;margin:36px auto;padding:0 24px}h1{margin-bottom:4px;font-size:28px}h2{margin:28px 0 8px;font-size:18px}.muted{color:#666} .cards{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.card{border:1px solid #ddd;border-radius:8px;padding:12px 16px;min-width:150px}.card strong{display:block;font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid #e6e6e6;text-align:left}th{background:#f5f5f7}code{font-size:10px;word-break:break-all}a{color:#4d49a5}footer{margin-top:32px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#666}@media print{body{margin:0 auto;padding:0 12px}a{color:inherit;text-decoration:none}.card,table{break-inside:avoid}}
    </style></head><body><header><p class="muted">FundShift · Portfolio exposure report</p><h1>${escapeHtml(data.fund)} holdings comparison</h1><p class="muted">${escapeHtml(data.from.as_of_date)} to ${escapeHtml(data.to.as_of_date)} · ${data.snapshot_intervals} snapshot interval${data.snapshot_intervals === 1 ? "" : "s"} · generated ${new Date().toLocaleString()}</p></header>
    <div class="cards"><div class="card"><span class="muted">Top ${data.summary.top_n} concentration</span><strong>${pct(data.summary.top_n_share.from)} → ${pct(data.summary.top_n_share.to)}</strong></div><div class="card"><span class="muted">HHI</span><strong>${data.summary.hhi.from.toFixed(4)} → ${data.summary.hhi.to.toFixed(4)}</strong></div><div class="card"><span class="muted">Cash exposure</span><strong>${pct(data.cash_weight.from)} → ${pct(data.cash_weight.to)}</strong></div><div class="card"><span class="muted">Position events</span><strong>${data.events.length}</strong></div></div>
    <h2>Sector exposure</h2><table><thead><tr><th>Sector</th><th>Start</th><th>Price adjusted</th><th>End</th><th>Change</th></tr></thead><tbody>${sectorRows || `<tr><td colspan="5">No sector data available</td></tr>`}</tbody></table>
    <h2>Largest position changes</h2><table><thead><tr><th>Position</th><th>Sector</th><th>Status</th><th>Start weight</th><th>End weight</th><th>Change</th></tr></thead><tbody>${positionRows || `<tr><td colspan="6">No position changes available</td></tr>`}</tbody></table>
    <h2>Source snapshots</h2><table><thead><tr><th>Snapshot</th><th>Date</th><th>Source file</th><th>Content hash</th></tr></thead><tbody>${sourceRows}</tbody></table>
    <h2>Method notes</h2><p>Weight effects are split into estimated price movement and portfolio activity. Flow factor: ${data.flow_factor.toFixed(4)}. Configuration version: ${escapeHtml(data.config_version)}.</p><ul>${caveats}</ul>
    <footer>For informational analysis only. Report reflects the supplied holdings snapshots and does not forecast returns or future risk.</footer></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${data.fund.toLowerCase()}-comparison-${data.from.as_of_date}-to-${data.to.as_of_date}.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
