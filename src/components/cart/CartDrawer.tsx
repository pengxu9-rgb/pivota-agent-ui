'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button, IconButton } from '@/components/ui/editorial/Button';
import { Eyebrow, Headline, Mono, Num, Title } from '@/components/ui/editorial/Type';
import { isAuroraEmbedMode, postRequestCloseToParent } from '@/lib/auroraEmbed';
import {
  combinedCurrency,
  combinedItemCount,
  combinedSubtotal,
  groupCartByMerchant,
  type MerchantGroup,
} from '@/lib/cartGrouping';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import { lookupMerchantName } from '@/lib/merchantRegistry';
import { useCartStore, type CartItem } from '@/store/cartStore';
import { resolveHostedCheckoutUrl } from '@/lib/ucpCheckout';
import { cn } from '@/lib/utils';

import { MerchantCartCard } from './editorial/MerchantCartCard';

/**
 * Editorial Cart drawer — merchant-grouped, sequential checkout.
 *
 *  - The drawer wraps the existing global cart store so the rest of the
 *    app (Add to Bag buttons, header pills, etc.) keeps working unchanged.
 *  - Items are re-keyed by `merchant_id` into `MerchantGroup[]` for
 *    rendering. The first merchant group's checkout CTA renders in
 *    terracotta (`accent`); others stay ink-filled.
 *  - Primary CTA at the bottom of the drawer triggers checkout for the
 *    first merchant only, mirroring `Checkout with {merchant}` inside that
 *    merchant's own card. Each merchant card's CTA also works independently.
 *  - Checkout submission goes through the existing `resolveHostedCheckoutUrl`
 *    (UCP first, legacy fallback) — never modifies checkout APIs. UCP
 *    already rejects multi-merchant carts as `blocked`, so we filter the
 *    cart to a single merchant's items before calling.
 */

function formatPrice(amount: number, currency: string | null): string {
  const safeCurrency = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
}

function buildHostedCheckoutItems(items: CartItem[]) {
  return items.map((item) => ({
    product_id: item.product_id || item.id,
    variant_id: item.variant_id || item.product_id || item.id,
    sku: item.sku,
    merchant_id: item.merchant_id,
    offer_id: item.offer_id,
    title: item.title,
    quantity: item.quantity,
    unit_price: item.price,
    currency: item.currency,
    image_url: normalizeDisplayImageUrl(item.imageUrl, '/placeholder.svg'),
  }));
}

export default function CartDrawer() {
  const router = useRouter();
  const { items, isOpen, close, removeItem, updateQuantity } = useCartStore();
  const isEmbed = useMemo(() => isAuroraEmbedMode(), []);
  const [checkingOutMerchantId, setCheckingOutMerchantId] = useState<string | null>(null);

  // Hydrate any cart line missing `merchant_name` from the runtime
  // merchant registry. The registry is populated as products surface
  // anywhere in the app (Browse, Chat, Catalog cards), so a PDP-frozen
  // add-to-cart path that didn't write merchant_name still gets a real
  // merchant label once the user has seen that merchant in any other
  // surface. Falls through to the existing `merchant_id` fallback when
  // the registry has no entry — never invents copy.
  const hydratedItems = useMemo(() => {
    if (!items.length) return items;
    let changed = false;
    const next = items.map((item) => {
      if (item.merchant_name && item.merchant_name.trim()) return item;
      const resolved = lookupMerchantName(item.merchant_id);
      if (!resolved) return item;
      changed = true;
      return { ...item, merchant_name: resolved };
    });
    return changed ? next : items;
  }, [items]);

  const groups = useMemo(() => groupCartByMerchant(hydratedItems), [hydratedItems]);
  const totalItems = useMemo(() => combinedItemCount(groups), [groups]);
  const subtotal = useMemo(() => combinedSubtotal(groups), [groups]);
  const currency = useMemo(() => combinedCurrency(groups), [groups]);

  const firstGroup = groups[0] ?? null;
  const followUpNames = groups
    .slice(1)
    .map((g) => g.merchantName)
    .filter(Boolean);

  // Reset in-flight state when the drawer closes so re-opening starts clean.
  useEffect(() => {
    if (!isOpen) setCheckingOutMerchantId(null);
  }, [isOpen]);

  const handleCheckoutMerchant = async (group: MerchantGroup) => {
    if (!group.items.length) return;
    setCheckingOutMerchantId(group.merchantId);
    try {
      const searchParams =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams();
      const result = await resolveHostedCheckoutUrl({
        items: buildHostedCheckoutItems(group.items),
        context: { searchParams },
      });
      if (result.status === 'blocked' || !result.url) {
        toast.error(
          result.message ||
            `${group.merchantName} checkout can't be opened right now. Please try again.`,
        );
        return;
      }

      try {
        const nextUrl = new URL(result.url, window.location.origin);
        if (nextUrl.origin !== window.location.origin) {
          window.location.assign(nextUrl.toString());
        } else {
          router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        }
      } catch {
        router.push(result.url);
      }
      close();
    } finally {
      setCheckingOutMerchantId(null);
    }
  };

  const handleEmptyAction = () => {
    close();
    if (isEmbed) {
      postRequestCloseToParent({ reason: 'empty_cart_back' });
      return;
    }
    router.push('/products');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed right-0 top-0 z-50 flex h-full w-full flex-col',
              'bg-paper text-ink border-l border-hairline shadow-2xl',
              'sm:w-[440px] lg:w-[520px]',
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Shopping bag"
          >
            {/* Header */}
            <header className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
              <IconButton
                label="Close cart"
                size="sm"
                className="-ml-2"
                onClick={close}
              >
                <X size={17} strokeWidth={1.75} />
              </IconButton>
              <div className="flex items-baseline gap-1.5 text-ink">
                <Headline as="h2" className="text-[16px] leading-none">
                  Bag
                </Headline>
                <span aria-hidden="true" className="text-ink-muted">·</span>
                <Num value={totalItems} className="text-[16px]" />
                {groups.length > 1 ? (
                  <Mono className="ml-1.5 text-[10px]">
                    {groups.length} stores
                  </Mono>
                ) : null}
              </div>
              {/* Symmetry spacer to keep title centred */}
              <span className="inline-block h-8 w-8" aria-hidden="true" />
            </header>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto bg-paper">
              {groups.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                  <p className="font-editorial-serif text-[20px] text-ink-2">
                    Your bag is empty.
                  </p>
                  <Mono className="text-ink-muted">
                    Saved pieces will appear here once you add them.
                  </Mono>
                  <Button variant="default" onClick={handleEmptyAction} className="mt-3">
                    {isEmbed ? 'Back to Aurora' : 'Browse products'}
                  </Button>
                </div>
              ) : (
                <>
                  {/* Pivota note — only shows when truly multi-merchant */}
                  {groups.length > 1 ? (
                    <div className="mx-4 mt-4 mb-4 border-l-[1.5px] border-terracotta bg-surface-2 px-3.5 py-3 sm:mx-5">
                      <Mono className="text-[9.5px] text-terracotta-ink">
                        Pivota · note
                      </Mono>
                      <p className="mt-1 font-editorial-sans text-[12.5px] leading-[1.5] text-ink-2">
                        Your bag spans{' '}
                        <Num value={groups.length} className="text-[12.5px]" /> houses —
                        each ships separately, so checkout is per merchant. I&apos;ll guide
                        you through them in order.
                      </p>
                    </div>
                  ) : (
                    <div className="h-4" />
                  )}

                  {/* Merchant cards */}
                  <div className="space-y-4 px-4 pb-3 sm:px-5">
                    {groups.map((group, idx) => (
                      <MerchantCartCard
                        key={group.merchantId}
                        group={group}
                        accent={idx === 0}
                        compact
                        onUpdateQuantity={(item, next) => updateQuantity(item.id, next)}
                        onRemoveItem={(item) => removeItem(item.id)}
                        onCheckoutMerchant={handleCheckoutMerchant}
                        checkoutDisabled={
                          checkingOutMerchantId !== null &&
                          checkingOutMerchantId !== group.merchantId
                        }
                      />
                    ))}
                  </div>

                  {/* Combined totals — only shows when multi-merchant */}
                  {groups.length > 1 ? (
                    <div className="mx-4 mb-4 border border-ink bg-surface px-4 py-4 sm:mx-5 sm:px-5">
                      <Eyebrow className="mb-3">Across all merchants</Eyebrow>
                      <div className="flex items-baseline justify-between py-1">
                        <Mono className="text-[10px] text-ink-muted">
                          Subtotal · {totalItems} item{totalItems === 1 ? '' : 's'}
                        </Mono>
                        <Num
                          value={formatPrice(subtotal, currency)}
                          className="text-[14px]"
                        />
                      </div>
                      <div className="flex items-baseline justify-between py-1">
                        <Mono className="text-[10px] text-ink-muted">
                          Shipping · {groups.length} merchants
                        </Mono>
                        <Mono className="text-[10px] text-ink-muted">at checkout</Mono>
                      </div>
                      <hr className="my-2 border-0 border-t border-hairline-2" />
                      <div className="flex items-baseline justify-between pb-1 pt-1">
                        <Title as="p" className="text-[15px]">
                          Total to spend
                        </Title>
                        <Num
                          value={formatPrice(subtotal, currency)}
                          className="text-[22px]"
                        />
                      </div>
                      <Mono className="text-[9px] text-ink-muted">
                        Shipping added at each merchant&apos;s checkout
                      </Mono>
                    </div>
                  ) : null}

                  <div className="h-6" />
                </>
              )}
            </div>

            {/* Sticky bottom CTA — sequential checkout helper. Single-merchant
                bags rely on the in-card `Checkout with {merchant}` button only
                so the drawer doesn't show two identical buttons. */}
            {firstGroup && groups.length > 1 ? (
              <div className="border-t border-hairline bg-paper px-4 py-3.5 sm:px-5">
                <Button
                  variant="default"
                  size="lg"
                  className="w-full justify-between px-5"
                  onClick={() => handleCheckoutMerchant(firstGroup)}
                  disabled={checkingOutMerchantId !== null}
                >
                  <span>Start with {firstGroup.merchantName}</span>
                  <Num
                    value={formatPrice(
                      firstGroup.subtotal,
                      firstGroup.currency || currency,
                    )}
                    className="text-[15px] text-paper"
                  />
                </Button>
                {followUpNames.length > 0 ? (
                  <Mono className="mt-2 block text-center text-[9px] text-ink-muted">
                    Then {followUpNames.join(' · then ')}
                  </Mono>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
