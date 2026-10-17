import type { Metadata } from "next";
import { Suspense } from "react";

import TerminalDesk from "@/components/terminal/TerminalDesk";

export const metadata: Metadata = { title: "Terminal · FundShift" };

export default function TerminalPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading terminal…</p>}>
      <TerminalDesk />
    </Suspense>
  );
}
