"use client";

import { useRef, useState } from "react";

import type { PortfolioTab } from "@/lib/planner";

export default function PortfolioTabs({
  tabs,
  activeId,
  disabled,
  onSelect,
  onCreate,
  onClose,
  onRename,
  onMove,
}: {
  tabs: PortfolioTab[];
  activeId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onMove: (id: string, beforeId: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const renameSettled = useRef(false);

  function beginRename(tab: PortfolioTab) {
    renameSettled.current = false;
    setEditing(tab.id);
    setDraft(tab.name);
  }

  async function commitRename(tab: PortfolioTab) {
    if (renameSettled.current) return;
    renameSettled.current = true;
    const name = draft.trim();
    setEditing(null);
    if (name && name !== tab.name) await onRename(tab.id, name);
    else setDraft(tab.name);
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-canvas/90 px-3 sm:px-5">
      <div
        role="tablist"
        aria-label="Open portfolios. Use Alt and the arrow keys to reorder tabs."
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              draggable={!disabled && editing !== tab.id}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", tab.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dragged = event.dataTransfer.getData("text/plain");
                if (dragged && dragged !== tab.id) onMove(dragged, tab.id);
              }}
              className={`group flex h-8 shrink-0 items-center rounded-md border transition-all duration-200 ${
                active ? "border-line-2 bg-panel text-fg" : "border-transparent text-muted hover:bg-panel/70 hover:text-fg"
              }`}
            >
              {editing === tab.id ? (
                <input
                  autoFocus
                  aria-label="Portfolio name"
                  value={draft}
                  maxLength={100}
                  disabled={disabled}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => void commitRename(tab)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitRename(tab);
                    } else if (event.key === "Escape") {
                      renameSettled.current = true;
                      setDraft(tab.name);
                      setEditing(null);
                    }
                  }}
                  className="w-36 rounded-[5px] bg-canvas px-2 py-1 text-xs text-fg outline-none ring-1 ring-accent-strong/70"
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="planner-portfolio-panel"
                  title={`${tab.name} — double-click to rename, drag to reorder`}
                  disabled={disabled}
                  onClick={() => onSelect(tab.id)}
                  onDoubleClick={() => beginRename(tab)}
                  onKeyDown={(event) => {
                    if (event.altKey && event.key === "ArrowLeft" && index > 0) {
                      event.preventDefault();
                      onMove(tab.id, tabs[index - 1].id);
                    } else if (event.altKey && event.key === "ArrowRight" && index < tabs.length - 1) {
                      event.preventDefault();
                      onMove(tabs[index + 1].id, tab.id);
                    }
                  }}
                  className="max-w-48 truncate px-3 text-left text-xs font-medium disabled:cursor-wait"
                >
                  {tab.name}
                </button>
              )}
              {editing !== tab.id && (
                <button
                  type="button"
                  aria-label={`Rename ${tab.name}`}
                  title="Rename portfolio (shared portfolios are copied first)"
                  disabled={disabled}
                  onClick={() => beginRename(tab)}
                  className={`flex h-5 w-5 items-center justify-center rounded text-faint transition-all hover:bg-panel-3 hover:text-fg focus-visible:opacity-100 disabled:cursor-wait ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                    <path d="m13.5 6.5 4 4" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                title="Close tab (saved portfolio is kept)"
                disabled={disabled}
                onClick={() => onClose(tab.id)}
                className="mr-1 flex h-5 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-panel-3 hover:text-fg disabled:cursor-wait"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-muted transition-colors hover:border-line-2 hover:bg-panel hover:text-fg disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden>＋</span>
        New portfolio
      </button>
    </div>
  );
}
