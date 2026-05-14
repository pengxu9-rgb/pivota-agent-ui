'use client';

/**
 * Sticky top chrome for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp.jsx → StickyTopBar:
 *   transparent over the hero, solidifying (white blur + hairline) once
 *   scrolled; glass-pill icon buttons. Back + Share are always shown;
 *   Save (heart) and Cart (bag) render only when a handler is supplied,
 *   so no non-functional chrome ships.
 */

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-white/55 text-current backdrop-blur-md backdrop-saturate-150"
    >
      {children}
    </button>
  );
}

export function BeautyStickyTopBar({
  scrolled,
  scrolledTitle,
  onBack,
  onShare,
  saved,
  onToggleSave,
  cartCount,
  onOpenCart,
}: {
  scrolled: boolean;
  scrolledTitle?: string | null;
  onBack?: () => void;
  onShare?: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
  cartCount?: number | null;
  onOpenCart?: () => void;
}) {
  return (
    <div
      className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-3.5 py-2 transition-all duration-200"
      style={{
        background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid hsl(var(--border))' : '1px solid transparent',
        color: scrolled ? 'hsl(var(--foreground))' : '#fff',
      }}
    >
      <IconBtn onClick={onBack} label="Go back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </IconBtn>

      {scrolled && scrolledTitle ? (
        <div className="min-w-0 flex-1 truncate px-3 text-[13px] font-semibold">{scrolledTitle}</div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex gap-1.5">
        {onToggleSave ? (
          <IconBtn onClick={onToggleSave} label={saved ? 'Remove from saved' : 'Save'}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill={saved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: saved ? '#D85A30' : undefined }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </IconBtn>
        ) : null}
        {onShare ? (
          <IconBtn onClick={onShare} label="Share">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
          </IconBtn>
        ) : null}
        {onOpenCart ? (
          <IconBtn onClick={onOpenCart} label="Open bag">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {cartCount && cartCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full border-[1.5px] border-white bg-[#D85A30] px-1 text-[9px] font-bold leading-none text-white">
                {cartCount}
              </span>
            ) : null}
          </IconBtn>
        ) : null}
      </div>
    </div>
  );
}
