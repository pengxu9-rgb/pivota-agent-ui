'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Brand "Explore the full collection" card — Brand Kit v2.0.
 *
 * Gradient monogram tile on the left (matches the Pivota mark language),
 * brand name + label in the centre, gradient pill arrow on the right.
 * White surface + hairline border consistent with Insights and shipping cards.
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

const GRADIENT = 'var(--pv-gradient-primary, linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%))';

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
      {/* Gradient monogram tile */}
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold tracking-[0.08em] text-white"
        style={{ background: GRADIENT }}
      >
        {monogram}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Explore the full collection</p>
      </div>

      {/* Gradient arrow pill */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: GRADIENT }}
      >
        <ChevronRight className="h-4 w-4" />
      </div>
    </>
  );

  const className =
    'mx-4 mt-2.5 flex items-center gap-3 rounded-2xl border border-border bg-white px-3.5 py-3 transition-opacity duration-150 active:opacity-75';

  if (brandHref) {
    return (
      <Link href={brandHref} prefetch={false} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}
