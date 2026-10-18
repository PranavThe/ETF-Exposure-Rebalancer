"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiDocsUrl } from "@/lib/api";
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
  return <span className="font-mono tabular-nums">{now ?? ""}</span>;
}

/** Kairos-style bottom bar: data status, the disclaimer, clock and links. */
export default function StatusBar() {
  const health = useHealth();
  const online = health.data?.status === "ok";
  return (
    <footer className="relative z-20 flex h-9 shrink-0 items-center border-t border-line bg-canvas/90 text-[12px] text-muted backdrop-blur">
      <span className="flex h-full items-center gap-2 border-r border-line px-3 sm:px-4" title={health.error ?? "Data service"}>
        <span className={`h-1.5 w-1.5 rounded-full ${health.loading ? "bg-faint" : online ? "live-dot bg-up" : "bg-down"}`} />
        {health.loading ? "Connecting" : online ? "Live" : "Offline"}
      </span>
      {health.data && (
        <span className="hidden h-full items-center gap-1.5 border-r border-line px-4 sm:flex">
          ETFs searchable <span className="font-mono text-fg">[{health.data.fund_count.toLocaleString()}]</span>
        </span>
      )}
      <span className="min-w-0 flex-1 truncate px-3 text-center text-faint">Derived from issuer-published holdings snapshots. Not investment advice.</span>
      <span className="hidden h-full items-center border-l border-line px-4 md:flex">
        <Clock />
      </span>
      <Link href="/methodology" className="hidden h-full items-center border-l border-line px-4 transition-colors hover:text-fg sm:flex">
        How it works
      </Link>
      <a href={apiDocsUrl} target="_blank" rel="noreferrer" className="hidden h-full items-center border-l border-line px-4 transition-colors hover:text-fg lg:flex">
        API
      </a>
    </footer>
  );
}
