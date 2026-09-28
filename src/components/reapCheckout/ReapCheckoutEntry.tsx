'use client';

// "Buy with Reap" beside "Visit store" on a links-out PDP — demo only.
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
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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

export function ReapCheckoutEntry(props: {
  productId: string;
  productTitle: string;
  storeUrl?: string | null;
  storeLabel?: string | null;
  offer?: OfferLike;
  product?: OfferLike;
  isExternalPurchase: boolean;
}) {
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

  if (!enabled || !props.isExternalPurchase || !merchants?.length) return null;
  if (offerIsDeclinedByPurchasabilityGate(props.offer)) return null;
  const domain = resolveMerchantDomain({ offer: props.offer, product: props.product, storeUrl: props.storeUrl });
  const merchant = domain ? merchants.find((m) => m.domain === domain) : null;
  if (!merchant || !props.productId) return null;

  return (
    <>
      <div
        className="fixed bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-4 z-40 lg:bottom-8 lg:right-8"
        data-testid="reap-entry"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 items-center gap-2 rounded-full border border-foreground/10 bg-white px-4 text-sm font-semibold text-foreground shadow-lg"
          data-testid="reap-entry-button"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Buy with Reap
        </button>
      </div>
      <ResponsiveSheet open={open} onClose={() => setOpen(false)} title="Checkout" mobileHeight="h-[88vh]">
        <ReapCheckoutPanel
          productId={props.productId}
          productTitle={props.productTitle}
          merchantDomain={merchant.domain}
          market={merchant.market}
          storeUrl={props.storeUrl}
          storeLabel={props.storeLabel}
        />
      </ResponsiveSheet>
    </>
  );
}
