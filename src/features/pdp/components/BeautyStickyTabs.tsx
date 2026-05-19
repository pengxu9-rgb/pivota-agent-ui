'use client';

/**
 * Sticky section-tab nav for the Beauty mobile PDP.
 * Reference: reference/pdp.jsx → StickyTabs.
 *
 * Layout: gradient Pivota mark (24 px) on the left as a running brand
 * breadcrumb, then a horizontally-scrollable pill row. Active pill uses
 * the ink/foreground black background per the brand kit (not primary teal)
 * so it reads clearly across all content beneath.
 */

export type BeautyTab = { id: string; label: string };

const DEFAULT_TABS: BeautyTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'insights', label: 'Insights' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'similar', label: 'Similar' },
];

export function BeautyStickyTabs({
  visible,
  activeTab,
  tabs = DEFAULT_TABS,
  onTabChange,
}: {
  visible: boolean;
  activeTab: string;
  tabs?: BeautyTab[];
  onTabChange: (id: string) => void;
}) {
  return (
    <div
      className="absolute left-0 right-0 top-0 z-[9] flex items-center gap-2.5 border-b border-border bg-white/95 px-3.5 py-2.5 backdrop-blur-md backdrop-saturate-150"
      style={{
        transform: visible ? 'translateY(52px)' : 'translateY(-100%)',
        transition: 'transform 220ms cubic-bezier(.2,.7,.3,1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      aria-hidden={!visible}
    >
      {/* 24px gradient mark — running brand breadcrumb per reference §09 */}
      <span
        aria-hidden="true"
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-white"
        style={{
          background: 'var(--pv-gradient-primary, linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%))',
        }}
      >
        <span
          className="text-[11px] font-semibold leading-none"
          style={{ fontFamily: 'var(--pv-font-brand, "Fredoka", system-ui, sans-serif)' }}
        >
          p<span style={{ marginLeft: 0.5 }}>.</span>
        </span>
      </span>

      {/* Pill tab row — horizontally scrollable so tabs never wrap or truncate */}
      <div className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              aria-current={isActive ? 'true' : undefined}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150"
              style={
                isActive
                  ? { background: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }
                  : { background: 'transparent', color: 'hsl(var(--foreground))' }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
