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
import { pp } from "@/lib/format";

// Categorical pair validated for colour-vision separation on the dark panel surface.
export const PRICE_COLOR = "#7a73f0";
export const ACTIVITY_COLOR = "#c98500";
const SURFACE = "#121215";
const GRID = "#222227";
const INK = "#ececf1";
const MUTED = "#9d9daa";

type Datum = { sector: string; price: number; activity: number; change: SectorChange };

function SectorTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload.change;
  return (
    <div className="rounded-md border border-line-2 bg-panel-2 px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold">{s.sector}</div>
      <div className="text-muted">Net drift {pp(s.drift)}</div>
      <div className="mt-1 flex items-center gap-1.5">
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

// Two-line axis label: the sector name, then its net drift.
function SectorTick({ x = 0, y = 0, payload, drifts }: {
  x?: number;
  y?: number;
  payload?: { value: string };
  drifts: Map<string, number>;
}) {
  const sector = payload?.value ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={-2} textAnchor="end" fontSize={12} fill={INK}>
        {sector}
      </text>
      <text x={-8} y={12} textAnchor="end" fontSize={11} fill={MUTED}>
        net {pp(drifts.get(sector) ?? 0)}
      </text>
    </g>
  );
}

/** Per sector: weight change split into price effect and portfolio activity, labelled with net drift. */
export default function SectorChart({ sectors }: { sectors: SectorChange[] }) {
  const data: Datum[] = sectors.map((s) => ({
    sector: s.sector,
    price: s.price_effect * 100,
    activity: s.activity_effect * 100,
    change: s,
  }));
  const drifts = new Map(sectors.map((s) => [s.sector, s.drift]));

  return (
    <div className="h-full min-h-[240px] w-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ left: 0, right: 16, top: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `${v.toFixed(1)} pp`}
            tick={{ fontSize: 11, fill: MUTED }}
            stroke={GRID}
          />
          <YAxis
            type="category"
            dataKey="sector"
            width={160}
            tick={<SectorTick drifts={drifts} />}
            stroke={GRID}
            interval={0}
          />
          <ReferenceLine x={0} stroke="#4a4a52" />
          <Tooltip content={<SectorTooltip />} cursor={{ fill: "#ffffff08" }} />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            itemSorter={null}
            formatter={(value: string) => <span style={{ color: INK }}>{value}</span>}
          />
          <Bar dataKey="price" name="Price effect" stackId="effect" fill={PRICE_COLOR}
            stroke={SURFACE} strokeWidth={2} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="activity" name="Portfolio activity" stackId="effect" fill={ACTIVITY_COLOR}
            stroke={SURFACE} strokeWidth={2} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
