// Small typographic building blocks for long-form site pages (no typography plugin).

export function DocSection({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line pt-12 pb-14 first:border-t-0 first:pt-0">
      <div className="label">{String(index).padStart(2, "0")}</div>
      <h2 id={`${id}-title`} className="mt-3 text-[26px] leading-[1.15] font-light tracking-[-0.02em] text-fg sm:text-[30px]">
        {title}
      </h2>
      <div className="mt-6 space-y-5 text-[16px] leading-[1.7] text-muted">{children}</div>
    </section>
  );
}

/** Inline code / identifier. */
export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[3px] bg-panel-2 px-1.5 py-0.5 font-mono text-[0.84em] text-fg/90">{children}</code>;
}

/** Emphasised term in body copy. */
export function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-fg">{children}</strong>;
}

/** A small captioned block of formulas in mono. Scrolls sideways on narrow screens. */
export function Formula({ label, children }: { label?: string; children: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-panel">
      {label && <figcaption className="label border-b border-line px-4 py-2">{label}</figcaption>}
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-6 text-fg/90 sm:text-[13px]">{children}</pre>
    </figure>
  );
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2.5 pl-5 marker:text-faint [&>li]:list-disc [&>li]:pl-1">{children}</ul>;
}

/** A simple bordered table; scrolls sideways on narrow screens. */
export function DocTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="bg-panel">
            {head.map((h) => (
              <th key={h} scope="col" className="label border-b border-line px-4 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70 last:border-b-0">
              {r.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 align-top ${j === 0 ? "text-fg" : "text-muted"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
