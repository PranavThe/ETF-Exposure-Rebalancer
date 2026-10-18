import type { Metadata } from "next";
import { Suspense } from "react";

import PlannerApp from "@/components/planner/PlannerApp";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Your sector mix · ${BRAND}`,
  description: "See the sector mix inside the ETFs you own, choose the mix you want, and get the moves that get you there.",
};

export default function AppPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading…</p>}>
      <PlannerApp />
    </Suspense>
  );
}
