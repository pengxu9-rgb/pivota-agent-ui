'use client';

// "Checkout with Reap" as the primary CTA of a links-out PDP's purchase bar — demo only.
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
import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ResponsiveSheet } from '@/features/pdp/components/ResponsiveSheet';
import {
  canonicalMerchantDomain,
  isReapCheckoutDemoClientEnabled,
  merchantDomainFromUrl,
  type DemoMerchant,
} from '@/lib/reapCheckout/config';
// Lazy: a PDP only downloads the checkout panel when the demo is on AND the buyer opens it.
const ReapCheckoutPanel = lazy(() => import('./ReapCheckoutPanel').then((m) => ({ default: m.ReapCheckoutPanel })));

type DemoConfig = { merchants: DemoMerchant[]; terms: { url: string; version: string } | null };
const EMPTY_CONFIG: DemoConfig = { merchants: [], terms: null };

type OfferLike = Record<string, unknown> | null | undefined;

let configPromise: Promise<DemoConfig> | null = null;

export function __resetReapConfigCacheForTests() {
  configPromise = null;
}

function loadDemoConfig(): Promise<DemoConfig> {
  // Only a SUCCESSFUL answer is cached for the page's life; a failure (network, 5xx) is forgotten, so the
  // next PDP render asks again instead of hiding the entry until a full reload.
  if (!configPromise) {
    const attempt: Promise<DemoConfig> = fetch('/api/reap-checkout/config', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (res.status === 404) return EMPTY_CONFIG; // the server switch is off: a real answer, cache it
        if (!res.ok) throw new Error(`config ${res.status}`);
        const body = await res.json();
        const terms =
          body?.terms && typeof body.terms.url === 'string' && typeof body.terms.version === 'string'
            ? { url: body.terms.url as string, version: body.terms.version as string }
            : null;
        return { merchants: Array.isArray(body?.merchants) ? (body.merchants as DemoMerchant[]) : [], terms };
      })
      .catch(() => {
        if (configPromise === attempt) configPromise = null;
        return EMPTY_CONFIG;
      });
    configPromise = attempt;
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
  variantId?: string;
  variantLabel?: string;
  productTitle: string;
  storeUrl?: string | null;
  storeLabel?: string | null;
  offer?: OfferLike;
  product?: OfferLike;
  isExternalPurchase: boolean;
};

/**
 * The demo entry as data for the PDP's own purchase bar: `cta` is non-null only when "Checkout with Reap"
 * should be offered (flag on, server switch on, demo merchant, not gate-declined), and `sheet` is the
 * checkout sheet to render once anywhere in the page. With the flag off, `cta` is null, `sheet` is null
 * and no request is made — the bar renders exactly what it renders on main.
 */
export type ReapBuyBarCta = { onOpen: (quantity: number) => void };

export function useReapCheckoutEntry(props: ReapCheckoutEntryProps): {
  cta: ReapBuyBarCta | null;
  sheet: ReactNode;
} {
  const enabled = isReapCheckoutDemoClientEnabled();
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [open, setOpen] = useState(false);
  // The PDP's chosen quantity, captured when the buyer opens checkout; the merchant's quote prices it.
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!enabled || !props.isExternalPurchase) return undefined;
    let alive = true;
    void loadDemoConfig().then((c) => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, [enabled, props.isExternalPurchase]);

  const onOpen = useCallback((q: number) => {
    setQuantity(Math.min(10, Math.max(1, Math.floor(Number(q) || 1))));
    setOpen(true);
  }, []);
  const onClose = useCallback(() => setOpen(false), []);

  let merchant: DemoMerchant | null = null;
  const merchants = config?.merchants;
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
        {open ? (
          <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
            <ReapCheckoutPanel
              productId={props.productId}
              variantId={props.variantId}
              variantLabel={props.variantLabel}
              productTitle={props.productTitle}
              merchantDomain={merchant.domain}
              market={merchant.market}
              quantity={quantity}
              terms={config?.terms ?? null}
              storeUrl={props.storeUrl}
              storeLabel={props.storeLabel}
            />
          </Suspense>
        ) : null}
      </ResponsiveSheet>
    ),
  };
}
