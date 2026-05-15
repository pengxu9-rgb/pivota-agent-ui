'use client';

/**
 * Sticky section-tab nav for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp-extras.jsx → StickyTabs:
 *   glass bar pinned to the top, slides in (translateY) once past the
 *   hero, four equal-width tabs, the active one tinted primary with a
 *   short underline pill.
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
      // Base position is `top-0` so the hidden state (translateY(-100%))
      // fully clears the viewport. When visible we translate DOWN by the
      // top-bar's height (h-9 + py-2 ≈ 52px) so the tracker stacks below
      // the back · search · share row instead of overlapping it. Anchoring
      // at top-[52px] and translating up by 100% left a sliver showing
      // through on a fresh page open.
      className="absolute left-0 right-0 top-0 z-[9] flex items-center border-b border-border bg-white/95 px-2 backdrop-blur-md backdrop-saturate-150"
      style={{
        transform: visible ? 'translateY(52px)' : 'translateY(-100%)',
        transition: 'transform 220ms cubic-bezier(.2,.7,.3,1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      aria-hidden={!visible}
    >
      {tabs.map((t) => {
        const isActive = t.id === activeTab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            aria-current={isActive ? 'true' : undefined}
            className={
              isActive
                ? 'relative flex-1 py-3 text-[12px] font-medium text-primary'
                : 'relative flex-1 py-3 text-[12px] font-medium text-muted-foreground'
            }
          >
            {t.label}
            {isActive ? (
              <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
