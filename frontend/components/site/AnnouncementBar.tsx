"use client";

import { useSyncExternalStore } from "react";

const KEY = "site-banner-dismissed";
const EVENT = "site-banner-change";

// The dismissal is remembered per browser. Storage can be unavailable (private mode,
// blocked site data), so every access is guarded and the bar simply shows again.
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

let dismissedThisSession = false;

export default function AnnouncementBar() {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => dismissedThisSession || readDismissed(),
    () => false,
  );

  if (dismissed) return null;

  function dismiss() {
    dismissedThisSession = true;
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Storage blocked: the in-memory flag still hides the bar for this page view.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div role="region" aria-label="Announcement" className="relative flex min-h-10 items-center justify-center bg-panel px-10 py-2 text-center text-[12px] text-fg/85 sm:px-12 sm:text-[13px]">
      <p>
        <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-up align-middle" aria-hidden />
        Holdings snapshots include their source and reporting date
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute top-1/2 right-1 grid h-8 w-8 -translate-y-1/2 place-items-center text-faint transition-colors hover:text-fg sm:right-4"
      >
        <svg aria-hidden viewBox="0 0 12 12" width="11" height="11">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </button>
    </div>
  );
}
