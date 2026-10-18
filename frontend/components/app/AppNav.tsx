"use client";

import Link from "next/link";

import { BRAND } from "@/lib/brand";
import { useHealth } from "@/lib/hooks";

export default function AppNav() {
  const health = useHealth();
  const online = health.data?.status === "ok";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-canvas px-3 sm:gap-4 sm:px-4">
      <Link href="/" className="shrink-0 text-base font-semibold tracking-tight text-fg sm:text-[19px]">
        {BRAND}
      </Link>
      <span className="hidden text-sm text-muted sm:inline">Your sector mix</span>
      <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
        <span className="hidden items-center gap-1.5 text-muted sm:flex" title={health.error ?? "Server status"}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${health.loading ? "bg-faint" : online ? "bg-up" : "bg-down"}`}
          />
          {health.loading ? "Connecting" : online ? "Live data" : "Offline"}
        </span>
        <Link href="/methodology" className="rounded-md border border-line px-2.5 py-1 text-muted hover:text-fg">
          How it works
        </Link>
      </div>
    </header>
  );
}
