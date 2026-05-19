'use client';

import type { ReactNode } from 'react';

/**
 * Sticky top chrome for the Beauty mobile PDP.
 *
 * Brand-Kit v2 protocol (handoff §3b):
 *  • Pre-scroll: transparent over the gallery; icon buttons wear a dark
 *    glass scrim so they read against any photography; the "Pivota."
 *    wordmark in Fredoka 600 sits as the single brand stamp on the hero.
 *  • Post-scroll (past ~280px): white-glass background + hairline border;
 *    icon buttons swap to a hairline-bordered white chip with ink icons;
 *    the wordmark is replaced by a centered brand + price + product-title
 *    breadcrumb so the user always knows what they're looking at.
 *
 * The previous in-bar search pill was retired — it didn't belong to the
 * v2 top-bar protocol and crowded the chrome over the hero.
 */

function IconBtn({
  children,
  onClick,
  label,
  dark,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  /** Pre-scroll = dark glass scrim + white icons; post-scroll = white chip + ink icons. */
  dark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md backdrop-saturate-150 transition-colors duration-200"
      style={
        dark
          ? {
              background: 'rgba(20,20,20,0.42)',
              border: '0.5px solid rgba(255,255,255,0.22)',
              color: '#fff',
            }
          : {
              background: 'rgba(255,255,255,0.95)',
              border: '0.5px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              boxShadow: '0 1px 2px rgba(20,10,40,0.04)',
            }
      }
    >
      {children}
    </button>
  );
}

export function BeautyStickyTopBar({
  scrolled,
  onBack,
  onShare,
  saved,
  onToggleSave,
  cartCount,
  onOpenCart,
  brand,
  title,
  priceLabel,
}: {
  scrolled: boolean;
  onBack?: () => void;
  onShare?: () => void;
  /**
   * Retained for compatibility — Brand Kit v2 retires the in-bar search pill,
   * but Electronics/Fashion mobile trees still forward the prop. Accept and
   * ignore so callers don't need a coordinated refactor.
   */
  onSearch?: () => void;
  searchPlaceholder?: string;
  saved?: boolean;
  onToggleSave?: () => void;
  cartCount?: number | null;
  onOpenCart?: () => void;
  /** Brand label for the post-scroll breadcrumb. */
  brand?: string | null;
  /** Product title for the post-scroll breadcrumb. */
  title?: string | null;
  /** Formatted price string for the post-scroll breadcrumb (e.g. "$32"). */
  priceLabel?: string | null;
}) {
  const dark = !scrolled;
  return (
    <div
      className="absolute left-0 right-0 top-0 z-10 flex items-center gap-2 px-3 py-2 transition-colors duration-200"
      style={{
        background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid hsl(var(--border))' : '1px solid transparent',
      }}
    >
      <IconBtn onClick={onBack} label="Go back" dark={dark}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </IconBtn>

      <div className="min-w-0 flex-1 pl-1">
        {scrolled ? (
          // Post-scroll: brand · price · title breadcrumb, ellipsised so it
          // never wraps regardless of length.
          <div className="min-w-0 truncate leading-tight">
            {brand ? (
              <span className="text-[12px] font-semibold text-foreground">{brand}</span>
            ) : null}
            <span className="block truncate text-[11px] font-medium text-muted-foreground">
              {priceLabel ? (
                <>
                  <span className="text-foreground">{priceLabel}</span>
                  {title ? <span className="mx-1.5">·</span> : null}
                </>
              ) : null}
              {title}
            </span>
          </div>
        ) : (
          // Pre-scroll: just the wordmark on the gallery. Fredoka 600 per the
          // brand kit; pivota-brand.css exposes it via --pv-font-brand.
          <span
            className="select-none text-[18px] font-semibold leading-none"
            style={{
              fontFamily: 'var(--pv-font-brand)',
              color: '#fff',
              letterSpacing: '-0.02em',
              textShadow: '0 1px 4px rgba(0,0,0,0.5)',
              background: 'rgba(0,0,0,0.28)',
              borderRadius: 8,
              padding: '3px 9px 4px',
            }}
          >
            Pivota<span style={{ opacity: 0.9 }}>.</span>
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
        {onToggleSave ? (
          <IconBtn onClick={onToggleSave} label={saved ? 'Remove from saved' : 'Save'} dark={dark}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={saved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: saved ? 'var(--pv-coral, #D85A30)' : undefined }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </IconBtn>
        ) : null}
        {onShare ? (
          <IconBtn onClick={onShare} label="Share" dark={dark}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
          </IconBtn>
        ) : null}
        {onOpenCart ? (
          <IconBtn onClick={onOpenCart} label="Open bag" dark={dark}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {cartCount && cartCount > 0 ? (
              <span
                className="absolute right-px top-px flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
                style={{
                  background: 'var(--pv-coral, #D85A30)',
                  border: '1.5px solid #fff',
                }}
              >
                {cartCount}
              </span>
            ) : null}
          </IconBtn>
        ) : null}
      </div>
    </div>
  );
}
