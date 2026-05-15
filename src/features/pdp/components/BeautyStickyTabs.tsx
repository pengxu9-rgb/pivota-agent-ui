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
      // Stacked BELOW the StickyTopBar (h-9 buttons + py-2 ≈ 52px) so the
      // back · search · share row stays on top and the section tracker sits
      // underneath it instead of overlapping at top-0.
      className="absolute left-0 right-0 top-[52px] z-[9] flex items-center border-b border-border bg-white/95 px-2 backdrop-blur-md backdrop-saturate-150"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
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
