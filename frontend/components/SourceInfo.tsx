import { holdingsUrl, type SnapshotMeta } from "@/lib/api";

function Side({ label, fund, meta }: { label: string; fund: string; meta: SnapshotMeta }) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <h3 className="label">
        {label} · <span className="text-fg">{meta.as_of_date}</span>
      </h3>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Source</dt>
        <dd className="min-w-0 break-all">
          {meta.source_url ? (
            <a className="text-accent hover:underline" href={meta.source_url} target="_blank" rel="noreferrer">
              {meta.source_url}
            </a>
          ) : (
            "Source URL unavailable"
          )}
        </dd>
        <dt className="text-muted">File</dt>
        <dd className="min-w-0 break-all font-mono text-xs leading-5">{meta.source_file}</dd>
        <dt className="text-muted">Content hash</dt>
        <dd className="min-w-0 break-all font-mono text-xs leading-5">{meta.content_hash}</dd>
        <dt className="text-muted">Rows</dt>
        <dd className="font-mono text-xs leading-5">{meta.row_count}</dd>
      </dl>
      <a
        className="inline-block text-sm text-accent hover:underline"
        href={holdingsUrl(fund, meta.as_of_date)}
        target="_blank"
        rel="noreferrer"
      >
        View underlying data (JSON) ↗
      </a>
    </div>
  );
}

export default function SourceInfo({
  fund,
  from,
  to,
  configVersion,
}: {
  fund: string;
  from: SnapshotMeta;
  to: SnapshotMeta;
  configVersion: string;
}) {
  return (
    <div id="source" className="p-4">
      <div className="flex flex-col gap-6 lg:flex-row">
        <Side label="From" fund={fund} meta={from} />
        <Side label="To" fund={fund} meta={to} />
      </div>
      <p className="mt-4 text-xs text-faint">Analytics config version {configVersion}.</p>
    </div>
  );
}
