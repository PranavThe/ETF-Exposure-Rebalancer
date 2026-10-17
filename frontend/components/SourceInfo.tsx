import { holdingsUrl, type SnapshotMeta } from "@/lib/api";

function Side({ label, fund, meta }: { label: string; fund: string; meta: SnapshotMeta }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <h3 className="font-semibold text-zinc-800">
        {label}: {meta.as_of_date}
      </h3>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5">
        <dt className="text-zinc-500">Source</dt>
        <dd className="min-w-0 break-all">
          {meta.source_url ? (
            <a className="text-blue-700 underline" href={meta.source_url} target="_blank" rel="noreferrer">
              {meta.source_url}
            </a>
          ) : (
            "Synthetic sample file"
          )}
        </dd>
        <dt className="text-zinc-500">File</dt>
        <dd className="min-w-0 break-all font-mono text-xs leading-5">{meta.source_file}</dd>
        <dt className="text-zinc-500">Content hash</dt>
        <dd className="min-w-0 break-all font-mono text-xs leading-5">{meta.content_hash}</dd>
        <dt className="text-zinc-500">Rows</dt>
        <dd>{meta.row_count}</dd>
      </dl>
      <a
        className="inline-block text-blue-700 underline"
        href={holdingsUrl(fund, meta.as_of_date)}
        target="_blank"
        rel="noreferrer"
      >
        View underlying data (JSON)
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
    <section id="source" className="min-w-0 rounded border border-zinc-200 bg-white p-4 text-sm">
      <h2 className="mb-3 text-base font-semibold">Source data</h2>
      <div className="flex flex-col gap-6 md:flex-row">
        <Side label="From" fund={fund} meta={from} />
        <Side label="To" fund={fund} meta={to} />
      </div>
      <p className="mt-3 text-xs text-zinc-500">Analytics config version {configVersion}.</p>
    </section>
  );
}
