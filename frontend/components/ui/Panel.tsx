export type PanelTab = { id: string; label: string; count?: number };

/** A terminal panel: a row of tabs over a scrolling body. */
export default function Panel({
  tabs,
  active,
  onTab,
  right,
  footer,
  children,
  className = "",
  bodyClassName = "",
}: {
  tabs: PanelTab[];
  active: string;
  onTab?: (id: string) => void;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-line bg-panel ${className}`}>
      <div role="tablist" className="flex h-9 shrink-0 items-stretch border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            onClick={() => onTab?.(t.id)}
            className="panel-tab"
          >
            {t.label}
            {t.count !== undefined && <span className="font-mono text-xs text-faint">{t.count}</span>}
          </button>
        ))}
        {right && <div className="ml-auto flex items-center gap-2 px-3 text-xs text-muted">{right}</div>}
      </div>
      <div role="tabpanel" className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>
        {children}
      </div>
      {footer && <div className="shrink-0 border-t border-line">{footer}</div>}
    </section>
  );
}
