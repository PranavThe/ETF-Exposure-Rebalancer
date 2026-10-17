"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
  type PieSectorShapeProps,
} from "recharts";

import type { SectorChange } from "@/lib/api";
import { pct, pp } from "@/lib/format";

// Categorical pair validated for colour-vision separation on the dark panel surface.
export const PRICE_COLOR = "#7a73f0";
export const ACTIVITY_COLOR = "#c98500";
const SURFACE = "#121215";
const GRID = "#222227";
const INK = "#ececf1";
const MUTED = "#9d9daa";
const SECTOR_COLORS = [
  "#7a73f0", "#c98500", "#2aaa9a", "#d36a85", "#699ee0", "#a0a64c",
  "#ac77d4", "#d17f59", "#4fbaa9", "#c2a65e", "#7b9ed0", "#d47ca8",
];

type Datum = { sector: string; price: number; activity: number; change: SectorChange };
type PieDatum = { sector: string; weight: number };

function PieSlice(props: PieSectorShapeProps) {
  return (
    <Sector
      {...props}
      fill={SECTOR_COLORS[props.index % SECTOR_COLORS.length]}
      stroke={SURFACE}
      strokeWidth={2}
    />
  );
}

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

/** Later sector mix and weight change split into price effect and portfolio activity. */
export default function SectorChart({ sectors }: { sectors: SectorChange[] }) {
  const pieData: PieDatum[] = sectors
    .filter((s) => s.w_to > 0)
    .map((s) => ({ sector: s.sector, weight: s.w_to }));
  const data: Datum[] = sectors.map((s) => ({
    sector: s.sector,
    price: s.price_effect * 100,
    activity: s.activity_effect * 100,
    change: s,
  }));
  const drifts = new Map(sectors.map((s) => [s.sector, s.drift]));

  return (
    <div className="w-full min-w-0 p-2">
      <div className="rounded border border-line bg-panel-2 p-3">
        <h3 className="text-sm font-semibold">Sector exposure · later snapshot</h3>
        <p className="text-xs text-muted">Share of equity holdings by sector.</p>
        {pieData.length > 0 ? (
          <div className="mt-2 grid items-center gap-3 sm:grid-cols-[176px_minmax(0,1fr)]">
            <div className="h-44 w-44" role="img" aria-label="Sector exposure pie chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="weight" nameKey="sector" outerRadius="82%"
                    shape={PieSlice} isAnimationActive={false} />
                  <Tooltip
                    formatter={(value) => pct(Number(value))}
                    contentStyle={{ backgroundColor: SURFACE, borderColor: GRID, color: INK }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="max-h-44 min-w-0 space-y-1 overflow-y-auto text-xs" aria-label="Sector exposure percentages">
              {pieData.map((item, index) => (
                <li key={item.sector} className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate" title={item.sector}>{item.sector}</span>
                  <span className="font-mono tabular-nums">{pct(item.weight)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">No equity sector exposure in the later snapshot.</p>
        )}
      </div>

      <h3 className="mt-4 px-1 text-sm font-semibold">Exposure change</h3>
      <p className="px-1 text-xs text-muted">Price and portfolio activity effects, in percentage points.</p>
      <div style={{ height: Math.max(240, data.length * 44 + 70) }}>
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
    </div>
  );
}
