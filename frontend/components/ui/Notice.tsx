export default function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: React.ReactNode }) {
  const style = tone === "error" ? "border-down/40 bg-down/10 text-down" : "border-line bg-panel text-muted";
  return <div className={`rounded-md border px-4 py-3 text-sm ${style}`}>{children}</div>;
}
