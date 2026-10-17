// Display names for API enums. UI copy follows SPEC §9: no trading language.

import type { Status } from "./api";

export const STATUS: Record<Status, { label: string; className: string }> = {
  ADDED: { label: "Added", className: "bg-up/15 text-up" },
  REMOVED: { label: "Removed", className: "bg-down/15 text-down" },
  INCREASED: { label: "Increased position", className: "bg-up/10 text-up" },
  DECREASED: { label: "Decreased position", className: "bg-down/10 text-down" },
  UNCHANGED: { label: "Unchanged", className: "bg-panel-3 text-muted" },
};

export const EVENT_TYPES: Record<string, { label: string; short: string }> = {
  POSITION_ADDED: { label: "Position added", short: "ADDED" },
  POSITION_REMOVED: { label: "Position removed", short: "REMOVED" },
  POSITION_INCREASED: { label: "Increased position", short: "INCREASED" },
  POSITION_DECREASED: { label: "Decreased position", short: "DECREASED" },
  SECTOR_INCREASE: { label: "Sector exposure up", short: "SECTOR UP" },
  SECTOR_DECREASE: { label: "Sector exposure down", short: "SECTOR DOWN" },
  CONCENTRATION_INCREASE: { label: "Concentration up", short: "CONC. UP" },
  CONCENTRATION_DECREASE: { label: "Concentration down", short: "CONC. DOWN" },
  SUSPECTED_CORPORATE_ACTION: { label: "Suspected corporate action", short: "SPLIT?" },
};

export const FLAGS: Record<string, { label: string; title: string }> = {
  SUSPECTED_CORPORATE_ACTION: {
    label: "Suspected split",
    title: "Share count and price moved by offsetting ratios; not counted as portfolio activity.",
  },
  PRICE_ESTIMATED: {
    label: "Price estimated",
    title: "No later price for a removed holding; the counterfactual uses the earlier price.",
  },
  DILUTION: {
    label: "Dilution",
    title: "Share count did not change materially; the weight moved because other positions changed size.",
  },
};

/** Up/down text colour for a signed value. */
export function tone(x: number): string {
  if (Math.round(x * 1000) === 0) return "text-muted";
  return x > 0 ? "text-up" : "text-down";
}
