import type { Snapshot } from "@/lib/api";
import { holdingsUrl } from "@/lib/api";

import { Card, CardHeader, Halftone, longDate } from "./kit";

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Where each stored snapshot came from: issuer URL or sample file, content hash, row count. */
export default function SourcesPanel({ fund, snapshots }: { fund: string; snapshots: Snapshot[] | undefined }) {
  const latest = snapshots?.[snapshots.length - 1];
  const list = snapshots ? [...snapshots].reverse() : [];
  return (
    <Card className="min-h-[260px]">
      <Halftone className="bottom-0 left-0" />
      <CardHeader
        right={
          latest && (
            <a
              href={holdingsUrl(fund, latest.as_of_date)}
              target="_blank"
              rel="noreferrer"
              className="flex h-6 items-center gap-1 rounded border border-line-2 bg-panel-2 px-2 text-xs text-fg hover:bg-panel-3"
              title="Latest holdings as JSON from the API"
            >
              Raw JSON ↗
            </a>
          )
        }
      >
        <span className="label">Sources</span>
        {snapshots && <span className="ml-2 font-mono text-[11px] text-faint">{snapshots.length}</span>}
      </CardHeader>
      <ul className="relative max-h-[420px] overflow-auto bg-panel">
        {!snapshots &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="border-b border-line/60 px-4 py-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-panel-2" />
            </li>
          ))}
        {list.map((s) => (
          <li key={s.as_of_date} className="border-b border-line/60 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">{longDate(s.as_of_date)}</span>
              <span className="font-mono text-xs text-muted tabular-nums">{s.row_count} rows</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
              {s.source_url ? (
                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noreferrer"
                  title={s.source_url}
                  className="min-w-0 truncate text-accent hover:underline"
                >
                  {host(s.source_url)} ↗
                </a>
              ) : (
                <span className="min-w-0 truncate text-faint" title={s.source_file}>
                  Synthetic sample file
                </span>
              )}
              <span className="shrink-0 font-mono text-faint" title={`SHA-256 ${s.content_hash}`}>
                {s.content_hash.slice(0, 8)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="relative mt-auto flex min-h-28 flex-1 flex-col justify-end px-4 py-3 text-right text-[11px] leading-relaxed text-faint">
        <span>Hash: SHA-256 of the normalized rows.</span>
        <span>Re-ingesting the same content is a no-op.</span>
      </p>
    </Card>
  );
}
