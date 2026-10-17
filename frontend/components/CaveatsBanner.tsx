export default function CaveatsBanner({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null;
  return (
    <section className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <h2 className="font-semibold">Read with care</h2>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );
}
