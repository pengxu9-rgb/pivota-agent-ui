'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { ServiceFeedCard } from '@/features/services/components/ServiceFeedCard';
import { interleaveServices } from '@/features/services/lib/sprinkled-pattern';
import { getProviderId } from '@/features/services/lib/types';
import type { ServiceCardData } from '@/features/services/lib/types';
import { isExternalAliasRouteId } from '@/lib/productHref';

/**
 * "You May Also Like" recommendation grid for the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp-extras.jsx → YouMayAlsoLike:
 *   2-column card grid — each card: square image, 2-line title, then
 *   either a pill badge or a gold-star rating row, a 2-line highlight,
 *   and a footer with price + a pill "Buy" button.
 */

export type BeautySimilarItem = {
  id: string;
  title: string;
  image: string;
  priceLabel: string;
  href?: string;
  merchant_id?: string | null;
  brand?: string | null;
  badge?: string | null;
  rating?: number | null;
  reviews?: number | null;
  highlight?: string | null;
};

function isExternalAliasProductHref(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const url = new URL(raw, 'https://agent.pivota.cc');
    const parts = url.pathname.split('/').filter(Boolean);
    const productsIndex = parts.findIndex((part) => part === 'products');
    return productsIndex >= 0 && isExternalAliasRouteId(decodeURIComponent(parts[productsIndex + 1] || ''));
  } catch {
    const match = raw.match(/\/products\/([^/?#]+)/);
    return isExternalAliasRouteId(match?.[1] ? decodeURIComponent(match[1]) : '');
  }
}

export function BeautyYouMayAlsoLike({
  items,
  services,
  onItemClick,
  onBuy,
}: {
  items: BeautySimilarItem[];
  services?: ServiceCardData[];
  onItemClick?: (item: BeautySimilarItem, index: number) => void;
  onBuy?: (item: BeautySimilarItem, index: number) => void;
}) {
  if (!items?.length) return null;

  const hasServices = Boolean(services?.length);
  const productItems = items.map((item, index) => ({ item, index }));
  const serviceItems = services || [];
  const mobileItems = hasServices ? interleaveServices(productItems, serviceItems, 'mobile') : [];
  const desktopItems = hasServices ? interleaveServices(productItems, serviceItems, 'desktop') : [];

  const renderProductCard = (p: BeautySimilarItem, idx: number) => {
    const safeHref = isExternalAliasProductHref(p.href) ? '' : p.href;
    const cardBody = (
      <>
        <div className="relative aspect-square overflow-hidden rounded-md bg-[var(--paper-muted,#F4F4F2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
        <div className="flex flex-1 flex-col pt-2 text-left">
          <div className="line-clamp-2 min-h-[2.7em] text-[12px] font-medium leading-[1.3] text-foreground">
            {p.brand ? <span className="text-muted-foreground">{p.brand} · </span> : null}{p.title}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-foreground">{p.priceLabel}</span>
            {typeof p.rating === 'number' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="hsl(var(--gold))" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {p.rating.toFixed(1)}
              </span>
            ) : p.badge ? (
              <span className="inline-flex rounded-full bg-[var(--paper-muted,#F4F4F2)] px-2 py-[2px] text-[10px] font-bold tracking-[-0.01em] text-[rgba(44,44,42,0.85)]">
                {p.badge}
              </span>
            ) : null}
            {onBuy ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onBuy(p, idx);
                }}
                className="ml-auto inline-flex h-[24px] items-center gap-1 rounded-full border border-border bg-white px-2 text-[11px] font-semibold text-foreground"
                aria-label={`Buy ${p.title}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                Buy
              </button>
            ) : null}
          </div>
        </div>
      </>
    );

    return (
      <div key={`${p.merchant_id || ''}:${p.id}`} className="flex flex-col">
        {safeHref ? (
          <Link
            href={safeHref}
            prefetch={false}
            onClick={() => onItemClick?.(p, idx)}
            className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={p.title}
          >
            {cardBody}
          </Link>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onItemClick?.(p, idx)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onItemClick?.(p, idx);
            }}
            className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={p.title}
          >
            {cardBody}
          </div>
        )}
      </div>
    );
  };

  const renderServiceCard = (service: ServiceCardData) => (
    <div key={`svc:${getProviderId(service.provider)}:${service.listing.listing_id || service.listing.id || service.listing.title}`} className="flex flex-col">
      <ServiceFeedCard service={service} />
    </div>
  );

  const renderInterleaved = (layout: 'mobile' | 'desktop') => {
    const source = layout === 'mobile' ? mobileItems : desktopItems;
    return source.map((entry) => (
      entry.kind === 'service'
        ? renderServiceCard(entry.data)
        : renderProductCard(entry.data.item, entry.data.index)
    ));
  };

  return (
    <div className="mt-3.5 px-4 pb-1">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          You may also like
        </div>
        {hasServices ? (
          <div className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--pv-ink-45)]">
            <MapPin size={10} className="text-[var(--pv-coral)]" aria-hidden="true" />
            Includes Seoul services
          </div>
        ) : null}
      </div>
      {/* 2-up on mobile (handoff §3i — replaces the old carousel; this is the
          Amazon / Sephora "more like this" feed pattern). The desktop tree
          (≥lg) widens it to a 4-up rail so it spans the full content width. */}
      {hasServices ? (
        <>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 lg:hidden">{renderInterleaved('mobile')}</div>
          <div className="hidden grid-cols-4 gap-x-2.5 gap-y-3.5 lg:grid">{renderInterleaved('desktop')}</div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 lg:grid-cols-4">
          {items.map((p, idx) => renderProductCard(p, idx))}
        </div>
      )}
    </div>
  );
}
