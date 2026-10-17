import type { SectorChange } from "@/lib/api";
import { pct, pp } from "@/lib/format";
import { tone } from "@/lib/labels";

/** The sector chart's table view: every drift with its price / activity / direct / dilution split. */
export default function SectorTable({ sectors }: { sectors: SectorChange[] }) {
  return (
    <table className="w-full whitespace-nowrap text-right text-sm tabular-nums">
      <thead className="label sticky top-0 bg-panel">
        <tr className="border-b border-line">
          <th className="px-3 py-2 text-left font-normal">Sector</th>
          <th className="px-3 py-2 font-normal">Weight</th>
          <th className="px-3 py-2 font-normal">Net drift</th>
          <th className="px-3 py-2 font-normal">Price</th>
          <th className="px-3 py-2 font-normal">Portfolio activity</th>
          <th className="px-3 py-2 font-normal">of which direct</th>
          <th className="px-3 py-2 font-normal">of which dilution</th>
        </tr>
      </thead>
      <tbody className="font-mono text-xs">
        {sectors.map((s) => (
          <tr key={s.sector} className="border-b border-line/60">
            <td className="px-3 py-2 text-left font-sans text-sm">{s.sector}</td>
            <td className="px-3 py-2">
              {pct(s.w_from)} → {pct(s.w_to)}
            </td>
            <td className={`px-3 py-2 font-semibold ${tone(s.drift)}`}>{pp(s.drift)}</td>
            <td className="px-3 py-2">{pp(s.price_effect)}</td>
            <td className="px-3 py-2">{pp(s.activity_effect)}</td>
            <td className="px-3 py-2">{pp(s.activity_direct)}</td>
            <td className="px-3 py-2">{pp(s.activity_dilution)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
