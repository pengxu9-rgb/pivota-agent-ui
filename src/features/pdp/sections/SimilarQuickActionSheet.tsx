'use client';

import { ArrowUpRight, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveSheet } from '@/features/pdp/components/ResponsiveSheet';
import type { Variant } from '@/features/pdp/types';
import {
  getDisplayVariantLabel,
  getDisplayVariantMeta,
} from '@/features/pdp/utils/variantLabels';
import { cn } from '@/lib/utils';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function SimilarQuickActionSheet({
  open,
  onClose,
  title,
  sellerLabel,
  variants,
  selectedVariantId,
  actionLabel,
  isSubmitting = false,
  onSelect,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sellerLabel?: string | null;
  variants: Variant[];
  selectedVariantId: string;
  actionLabel: 'Buy' | 'Open';
  isSubmitting?: boolean;
  onSelect: (variantId: string) => void;
  onSubmit: () => void;
}) {
  const footer = (
    <div className="border-t border-border bg-card px-4 pb-4 pt-3">
      <Button
        className="h-11 w-full rounded-full text-sm font-semibold"
        disabled={isSubmitting}
        onClick={onSubmit}
      >
        {actionLabel === 'Open' ? <ArrowUpRight className="mr-1.5 h-4 w-4" /> : <ShoppingBag className="mr-1.5 h-4 w-4" />}
        {isSubmitting ? `${actionLabel}ing...` : actionLabel}
      </Button>
    </div>
  );

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title={title}
      mobileHeight="h-[58vh]"
      footer={footer}
    >
      <div className="px-4 py-4">
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Select option
          </div>
          {sellerLabel ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Recommended seller: <span className="font-medium text-foreground">{sellerLabel}</span>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          {variants.map((variant) => {
            const isSelected = variant.variant_id === selectedVariantId;
            const amount = variant.price?.current.amount ?? 0;
            const currency = variant.price?.current.currency || 'USD';
            const displayTitle = getDisplayVariantLabel(variant);
            const meta = getDisplayVariantMeta(variant);
            return (
              <button
                key={variant.variant_id}
                type="button"
                onClick={() => onSelect(variant.variant_id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-foreground/15 hover:bg-muted/30',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
                  {meta ? (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</div>
                  ) : null}
                </div>
                <div className="shrink-0 text-sm font-semibold text-foreground">
                  {formatPrice(amount, currency)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ResponsiveSheet>
  );
}
