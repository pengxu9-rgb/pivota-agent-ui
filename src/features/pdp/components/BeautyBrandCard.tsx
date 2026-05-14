'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Brand "Explore the full collection" card for the Beauty mobile PDP.
 *
 * The redesign/pivota-pdp.jsx source of truth had no brand section, so
 * this is carried over near-verbatim from the legacy BeautyReviewsSection
 * brand card (monogram tile + brand name + "Explore the full collection"),
 * which is already styled for the .lovable-pdp scope.
 */

function getBrandMonogram(value: string): string {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'BR';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

export function BeautyBrandCard({
  brandName,
  brandHref,
}: {
  brandName?: string | null;
  brandHref?: string | null;
}) {
  const name = String(brandName || '').trim();
  if (!name) return null;
  const monogram = getBrandMonogram(name);

  const inner = (
    <>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-white/90 text-[11px] font-semibold tracking-[0.18em] text-foreground shadow-sm">
        {monogram}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Explore the full collection</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );

  const className =
    'mx-[18px] mt-2.5 flex items-center gap-3 rounded-[20px] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,246,242,0.98))] px-3.5 py-3';

  if (brandHref) {
    return (
      <Link href={brandHref} prefetch={false} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}
