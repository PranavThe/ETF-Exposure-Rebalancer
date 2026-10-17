"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useHealth } from "@/lib/hooks";

function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{now ?? ""}</span>;
}

export default function StatusBar() {
  const health = useHealth().data;
  return (
    <footer className="flex min-h-8 shrink-0 items-center gap-4 border-t border-line bg-base px-4 py-1 text-xs text-muted">
      {health && (
        <span className="hidden font-mono sm:inline">
          {health.fund_count} funds · {health.snapshot_count} snapshots
        </span>
      )}
      <span className="min-w-0 flex-1 text-center text-faint sm:truncate">
        Derived from issuer-published holdings snapshots. Not investment advice.
      </span>
      <Link href="/methodology" className="hidden hover:text-fg sm:inline">
        Methodology
      </Link>
      <span className="hidden border-l border-line pl-4 md:inline">
        <Clock />
      </span>
    </footer>
  );
}
