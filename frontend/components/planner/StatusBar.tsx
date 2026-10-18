"use client";

import Link from "next/link";

import { apiDocsUrl } from "@/lib/api";
import { useHealth } from "@/lib/hooks";

/** A quiet bottom line: data status, the disclaimer, and links. */
export default function StatusBar() {
  const health = useHealth();
  const online = health.data?.status === "ok";
  return (
    <footer className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-6 py-2 text-[12px] text-faint sm:flex-nowrap sm:py-0">
      <span className="flex items-center gap-2" title={health.error ?? "Data service"}>
        <span className={`h-1.5 w-1.5 rounded-full ${health.loading ? "bg-faint" : online ? "bg-up" : "bg-down"}`} />
        {health.loading ? "Connecting" : online ? "Live data" : "Offline"}
      </span>
      <span className="min-w-0 flex-1 text-center sm:truncate">Derived from issuer-published holdings snapshots. Not investment advice.</span>
      <Link href="/methodology" className="hidden transition-colors hover:text-fg sm:inline">
        How it works
      </Link>
      <a href={apiDocsUrl} target="_blank" rel="noreferrer" className="hidden transition-colors hover:text-fg lg:inline">
        API
      </a>
    </footer>
  );
}
