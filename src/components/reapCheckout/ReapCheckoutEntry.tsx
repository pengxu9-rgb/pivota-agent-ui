'use client';

// "Buy with Reap" as the primary CTA of a links-out PDP's purchase bar — demo only.
//
// FLAG OFF (NEXT_PUBLIC_REAP_CHECKOUT_DEMO unset, the default): renders null and makes NO request,
// so the PDP is exactly today's. Flag on: asks /api/reap-checkout/config once per page load (404
// when the server switch is off -> nothing rendered), and shows the entry only for a merchant in
// the demo list whose offer the gateway has NOT marked as declined by the purchasability gate.
//
// The purchasability gate is authoritative at create time inside the gateway's Reap lane (same
// client, same market source: the shipping country this form sends as `context.address_country`).
// A decline there makes the create answer a non-Reap checkout, and the panel then says Reap is not
// available and offers the store. The offer-level check here only hides the entry early when the
// gateway already rewrote the offer as declined (execution_spec rail `referral` + join_mode
// `referral_only`, PIVOTA-Agent src/offers/offersPriority.js enrichOfferCommerceMetadata).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ResponsiveSheet } from '@/features/pdp/components/ResponsiveSheet';
import {
  canonicalMerchantDomain,
  isReapCheckoutDemoClientEnabled,
  merchantDomainFromUrl,
  type DemoMerchant,
} from '@/lib/reapCheckout/config';
import { ReapCheckoutPanel } from './ReapCheckoutPanel';

type OfferLike = Record<string, unknown> | null | undefined;

let configPromise: Promise<DemoMerchant[]> | null = null;

export function __resetReapConfigCacheForTests() {
  configPromise = null;
}

function loadDemoMerchants(): Promise<DemoMerchant[]> {
  if (!configPromise) {
    configPromise = fetch('/api/reap-checkout/config', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => (Array.isArray(body?.merchants) ? (body.merchants as DemoMerchant[]) : []))
      .catch(() => []);
  }
  return configPromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The gateway's purchasability-decline rewrite of an offer. */
export function offerIsDeclinedByPurchasabilityGate(offer: OfferLike): boolean {
  if (!isRecord(offer)) return false;
  const spec = isRecord(offer.execution_spec) ? offer.execution_spec : null;
  const tracking = spec && isRecord(spec.tracking) ? spec.tracking : null;
  return Boolean(spec && spec.rail === 'referral' && tracking && tracking.join_mode === 'referral_only');
}

/** The merchant's domain: an explicit field on the offer or product, else the storefront URL's host. */
export function resolveMerchantDomain(args: {
  offer?: OfferLike;
  product?: OfferLike;
  storeUrl?: string | null;
}): string | null {
  for (const source of [args.offer, args.product]) {
    if (!isRecord(source)) continue;
    for (const key of ['merchant_domain', 'source_domain', 'store_domain']) {
      const d = canonicalMerchantDomain(source[key]);
      if (d) return d;
    }
  }
  return merchantDomainFromUrl(args.storeUrl);
}

export type ReapCheckoutEntryProps = {
  productId: string;
  productTitle: string;
  storeUrl?: string | null;
  storeLabel?: string | null;
  offer?: OfferLike;
  product?: OfferLike;
  isExternalPurchase: boolean;
};

/**
 * The demo entry as data for the PDP's own purchase bar: `cta` is non-null only when "Buy with Reap"
 * should be offered (flag on, server switch on, demo merchant, not gate-declined), and `sheet` is the
 * checkout sheet to render once anywhere in the page. With the flag off, `cta` is null, `sheet` is null
 * and no request is made — the bar renders exactly what it renders on main.
 */
export function useReapCheckoutEntry(props: ReapCheckoutEntryProps): {
  cta: { onOpen: () => void } | null;
  sheet: ReactNode;
} {
  const enabled = isReapCheckoutDemoClientEnabled();
  const [merchants, setMerchants] = useState<DemoMerchant[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || !props.isExternalPurchase) return undefined;
    let alive = true;
    void loadDemoMerchants().then((m) => {
      if (alive) setMerchants(m);
    });
    return () => {
      alive = false;
    };
  }, [enabled, props.isExternalPurchase]);

  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);

  let merchant: DemoMerchant | null = null;
  if (enabled && props.isExternalPurchase && merchants?.length && props.productId) {
    if (!offerIsDeclinedByPurchasabilityGate(props.offer)) {
      const domain = resolveMerchantDomain({ offer: props.offer, product: props.product, storeUrl: props.storeUrl });
      merchant = (domain && merchants.find((m) => m.domain === domain)) || null;
    }
  }
  const cta = useMemo(() => (merchant ? { onOpen } : null), [merchant, onOpen]);
  if (!merchant) return { cta: null, sheet: null };

  return {
    cta,
    sheet: (
      <ResponsiveSheet open={open} onClose={onClose} title="Checkout" mobileHeight="h-[88vh]">
        <ReapCheckoutPanel
          productId={props.productId}
          productTitle={props.productTitle}
          merchantDomain={merchant.domain}
          market={merchant.market}
          storeUrl={props.storeUrl}
          storeLabel={props.storeLabel}
        />
      </ResponsiveSheet>
    ),
  };
}
