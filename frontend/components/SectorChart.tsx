"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SectorChange } from "@/lib/api";
import { pct, pp } from "@/lib/format";

// Categorical slots 1 and 2, validated for CVD separation on the light surface.
const PRICE_COLOR = "#2a78d6";
const ACTIVITY_COLOR = "#eb6834";
const SURFACE = "#ffffff";

type Datum = { sector: string; price: number; activity: number; change: SectorChange };

// Two-line axis label: the sector name, then its net drift.
function SectorTick({
  x = 0,
  y = 0,
  payload,
  drifts,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  drifts: Map<string, number>;
}) {
  const sector = payload?.value ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-6} y={-2} textAnchor="end" fontSize={12} fill="#0b0b0b">
        {sector}
      </text>
      <text x={-6} y={12} textAnchor="end" fontSize={11} fill="#52514e">
        net {pp(drifts.get(sector) ?? 0)}
      </text>
    </g>
  );
}

function SectorTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload.change;
  return (
    <div className="rounded border border-zinc-200 bg-white px-3 py-2 text-xs shadow">
      <div className="font-semibold">{s.sector}</div>
      <div>Net drift {pp(s.drift)}</div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PRICE_COLOR }} />
        Price {pp(s.price_effect)}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ACTIVITY_COLOR }} />
        Portfolio activity {pp(s.activity_effect)} (direct {pp(s.activity_direct)}, dilution{" "}
        {pp(s.activity_dilution)})
      </div>
    </div>
  );
}

export default function SectorChart({ sectors }: { sectors: SectorChange[] }) {
  const data: Datum[] = sectors.map((s) => ({
    sector: s.sector,
    price: s.price_effect * 100,
    activity: s.activity_effect * 100,
    change: s,
  }));
  const drifts = new Map(sectors.map((s) => [s.sector, s.drift]));

  return (
    <section className="min-w-0 rounded border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold">Sector exposure change</h2>
      <p className="mb-2 text-sm text-zinc-600">
        Each bar splits a sector&apos;s weight change into price movement and portfolio activity. The
        axis label shows the net drift.
      </p>
      <div style={{ height: data.length * 44 + 70 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ left: 0, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="#e7e6e2" />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${v.toFixed(1)} pp`}
              tick={{ fontSize: 11, fill: "#52514e" }}
              stroke="#d4d3cf"
            />
            <YAxis
              type="category"
              dataKey="sector"
              width={160}
              tick={<SectorTick drifts={drifts} />}
              stroke="#d4d3cf"
            />
            <ReferenceLine x={0} stroke="#8a8984" />
            <Tooltip content={<SectorTooltip />} cursor={{ fill: "#f0efec" }} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              itemSorter={null}
              formatter={(value: string) => <span style={{ color: "#0b0b0b" }}>{value}</span>}
            />
            <Bar dataKey="price" name="Price effect" stackId="effect" fill={PRICE_COLOR}
              stroke={SURFACE} strokeWidth={2} barSize={20} isAnimationActive={false} />
            <Bar dataKey="activity" name="Portfolio activity" stackId="effect" fill={ACTIVITY_COLOR}
              stroke={SURFACE} strokeWidth={2} barSize={20} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 overflow-x-auto">
      <table className="w-full whitespace-nowrap text-right text-sm tabular-nums [&_td]:px-2 [&_th]:px-2">
        <thead className="text-xs text-zinc-500">
          <tr>
            <th className="text-left font-medium">Sector</th>
            <th className="font-medium">Weight</th>
            <th className="font-medium">Net drift</th>
            <th className="font-medium">Price</th>
            <th className="font-medium">Portfolio activity</th>
            <th className="font-medium">of which direct</th>
            <th className="font-medium">of which dilution</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => (
            <tr key={s.sector} className="border-t border-zinc-100">
              <td className="py-1 text-left">{s.sector}</td>
              <td>
                {pct(s.w_from)} → {pct(s.w_to)}
              </td>
              <td className="font-medium">{pp(s.drift)}</td>
              <td>{pp(s.price_effect)}</td>
              <td>{pp(s.activity_effect)}</td>
              <td>{pp(s.activity_direct)}</td>
              <td>{pp(s.activity_dilution)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
