'use client';

import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Variant } from '@/features/pdp/types';
import { getOptionValue } from '@/features/pdp/utils/variantOptions';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function GenericColorSheet({
  open,
  onClose,
  variants,
  selectedVariantId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  variants: Variant[];
  selectedVariantId: string;
  onSelect: (variantId: string) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[2147483647] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[2147483647] h-[70vh] rounded-t-2xl bg-card border border-border shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold">Select Color ({variants.length})</div>
              <button
                onClick={onClose}
                className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 overflow-y-auto px-4 pb-4">
              {variants.map((variant) => {
                const isSelected = variant.variant_id === selectedVariantId;
                const amount = variant.price?.current.amount ?? 0;
                const currency = variant.price?.current.currency || 'USD';
                const colorLabel =
                  getOptionValue(variant, ['color', 'colour', 'shade', 'tone']) || variant.title;
                return (
                  <button
                    key={variant.variant_id}
                    onClick={() => {
                      onSelect(variant.variant_id);
                      onClose();
                    }}
                    className={`flex flex-col items-center gap-0.5 p-1.5 rounded-md border text-center transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="relative h-16 w-11 rounded overflow-hidden bg-muted">
                      {variant.label_image_url || variant.image_url ? (
                        <Image
                          src={variant.label_image_url || variant.image_url}
                          alt={colorLabel}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : variant.swatch?.hex ? (
                        <span className="absolute inset-0" style={{ backgroundColor: variant.swatch.hex }} />
                      ) : null}
                    </div>
                    <span className="text-[9px] text-muted-foreground line-clamp-1">{colorLabel}</span>
                    <span className="text-[9px] font-medium">{formatPrice(amount, currency)}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
