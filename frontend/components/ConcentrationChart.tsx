"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

import type { Summary } from "@/lib/api";
import { hhi, pct, pp, signedHhi } from "@/lib/format";

const BAR = "#7a73f0";
const GRID = "#222227";
const MUTED = "#9d9daa";
const INK = "#ececf1";

function Mini({ title, values, format, change }: {
  title: string;
  values: { from: number; cf: number; to: number };
  format: (x: number) => string;
  change: string;
}) {
  const data = [
    { name: "From", value: values.from },
    { name: "Counterfactual", value: values.cf },
    { name: "To", value: values.to },
  ];
  return (
    <div className="flex min-h-[220px] min-w-0 flex-1 flex-col">
      <div className="px-3 pt-3">
        <div className="label">{title}</div>
        <div className="mt-1 text-sm text-muted">{change}</div>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
            <YAxis hide domain={[0, "auto"]} />
            <Bar dataKey="value" fill={BAR} maxBarSize={44} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="value" position="top" formatter={(v) => format(Number(v))} fill={INK} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Top-N share and HHI on the earlier weights, the counterfactual and the later weights. */
export default function ConcentrationChart({ summary }: { summary: Summary }) {
  const top = summary.top_n_share;
  const h = summary.hhi;
  return (
    <div className="flex h-full flex-col gap-2 md:flex-row">
      <Mini
        title={`Top-${summary.top_n} share`}
        values={top}
        format={(x) => pct(x)}
        change={`${pp(top.to - top.from)} (price ${pp(top.cf - top.from)}, portfolio activity ${pp(top.to - top.cf)})`}
      />
      <Mini
        title="Concentration (HHI)"
        values={h}
        format={hhi}
        change={`${signedHhi(h.to - h.from)} (price ${signedHhi(h.cf - h.from)}, portfolio activity ${signedHhi(h.to - h.cf)})`}
      />
    </div>
  );
}
