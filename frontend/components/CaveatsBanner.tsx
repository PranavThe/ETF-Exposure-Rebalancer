export default function CaveatsBanner({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) {
    return <p className="p-4 text-sm text-muted">No caveats for this comparison.</p>;
  }
  return (
    <ul className="space-y-2 p-4 text-sm">
      {caveats.map((c) => (
        <li key={c} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-activity" />
          <span className="text-fg/90">{c}</span>
        </li>
      ))}
    </ul>
  );
}
