/* eslint-disable @next/next/no-img-element */
// A multi-size offer row the gateway built with no selected variant carries PRODUCT-level
// `inventory.in_stock` (any size in stock). Buy follows the selected size's own entry in the row's
// variants[]; a verdict that disables Buy today still does. Mounted through the real adapter.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdpContainer } from './PdpContainer';
import nativeResponse from '@/features/pdp/__fixtures__/currentOwnMoney/native226.json';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { PDPPayload } from '@/features/pdp/types';
import { __resetReapConfigCacheForTests } from '@/components/reapCheckout/ReapCheckoutEntry';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => {
    const { fill: _f, unoptimized: _u, priority: _p, fetchPriority: _fp, alt, ...rest } = props as any;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', () => ({
  listQuestions: vi.fn(async () => ({ items: [] })),
  postQuestion: vi.fn(async () => ({ question_id: 1 })),
  getSimilarProductsMainline: vi.fn(async () => ({ items: [] })),
  getPdpV2: vi.fn(async () => null),
}));
vi.mock('sonner', () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }));

class IO {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  __resetReapConfigCacheForTests();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.stubEnv('NEXT_PUBLIC_GENERIC_PDP_USE_STANDARD_SHELL', 'true');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false, merchants: [] }), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const SMALL = '47170040267002'; // 50 mL
const LARGE = '47170040267003'; // 100 mL
const PAGE_URL = 'https://jurlique.com/products/synthetic-final-shared-listing';

/**
 * The native two-size response with both sizes priced and in stock on the card, and a row whose
 * `inventory.in_stock` is product-level true. Each size's row entry is spelled the way stored rows
 * spell variant ids: 50 mL as a gid, 100 mL as the JSON-LD offer `@id` URL.
 */
function twoSizePayload(rowStock: { small?: boolean; large?: boolean } = {}): PDPPayload {
  const p = mapPdpV2ToPdpPayload(structuredClone(nativeResponse) as any)!;
  const [small, large] = [
    p.product.variants.find((v) => v.variant_id === SMALL)!,
    p.product.variants.find((v) => v.variant_id === '222')!,
  ];
  large.variant_id = LARGE;
  large.sku_id = LARGE;
  delete large.current_own_offer_status;
  large.price = { current: { amount: 59, currency: 'USD' } };
  large.availability = { in_stock: true };
  small.availability = { in_stock: true };
  const offer = p.offers![0];
  expect(offer.inventory?.in_stock).toBe(true);
  const [smallEntry, largeEntry] = [
    offer.variants!.find((v) => v.variant_id === SMALL)!,
    offer.variants!.find((v) => v.variant_id === '222')!,
  ];
  smallEntry.variant_id = `gid://shopify/ProductVariant/${SMALL}`;
  largeEntry.variant_id = `${PAGE_URL}?variant=${LARGE}#offer`;
  delete largeEntry.current_own_offer_status;
  largeEntry.price = large.price;
  smallEntry.availability = { in_stock: rowStock.small ?? true };
  largeEntry.availability = { in_stock: rowStock.large ?? true };
  return p;
}

function renderPdp(p: PDPPayload) {
  return render(<PdpContainer payload={p} mode="generic" onAddToCart={() => {}} onBuyNow={() => {}} />);
}

const storeButton = () => screen.getByRole('button', { name: /View at/ });
const pick = (size: RegExp) => fireEvent.click(screen.getByRole('button', { name: size }));

describe('Buy follows the selected size on a product-level offer row', () => {
  it('a sold-out size on the row disables Buy although the row says some size is in stock', () => {
    renderPdp(twoSizePayload({ large: false }));
    expect(storeButton()).toBeEnabled();
    pick(/100 mL/i);
    expect(storeButton()).toBeDisabled();
    pick(/50 mL/i);
    expect(storeButton()).toBeEnabled();
  });

  it('the other size stays buyable: a sold-out 50 mL (gid entry) leaves 100 mL enabled', () => {
    renderPdp(twoSizePayload({ small: false }));
    expect(storeButton()).toBeDisabled();
    pick(/100 mL/i);
    expect(storeButton()).toBeEnabled();
  });

  it('a row entry for a subscription (selling_plan) URL names no variant: the row decides, as today', () => {
    const p = twoSizePayload({ large: false });
    const entry = p.offers![0].variants!.find((v) => v.variant_id.includes(LARGE))!;
    entry.variant_id = `${PAGE_URL}?variant=${LARGE}&selling_plan=123`;
    renderPdp(p);
    pick(/100 mL/i);
    expect(storeButton()).toBeEnabled();
  });

  it('a size in stock on the row is buyable when the row-level stock names another size', () => {
    const p = twoSizePayload({ small: false, large: true });
    p.offers![0].inventory = { in_stock: false };
    renderPdp(p);
    expect(storeButton()).toBeDisabled();
    pick(/100 mL/i);
    expect(storeButton()).toBeEnabled();
  });
});

describe('a row with no variants[] keeps today’s stock gating', () => {
  function noVariantRow(rowInStock: boolean) {
    const p = twoSizePayload();
    delete p.offers![0].variants;
    p.offers![0].inventory = { in_stock: rowInStock };
    return p;
  }

  it('row in stock, both card sizes in stock: Buy enabled on each size', () => {
    renderPdp(noVariantRow(true));
    expect(storeButton()).toBeEnabled();
    pick(/100 mL/i);
    expect(storeButton()).toBeEnabled();
  });

  it('row out of stock: Buy disabled even where the card says the size is in stock', () => {
    renderPdp(noVariantRow(false));
    expect(storeButton()).toBeDisabled();
    pick(/100 mL/i);
    expect(storeButton()).toBeDisabled();
  });

  it('row in stock but the card marks the selected size sold out: that size is disabled', () => {
    const p = noVariantRow(true);
    p.product.variants.find((v) => v.variant_id === LARGE)!.availability = { in_stock: false };
    renderPdp(p);
    expect(storeButton()).toBeEnabled();
    pick(/100 mL/i);
    expect(storeButton()).toBeDisabled();
  });
});

describe('a per-size in-stock entry never re-enables a verdict-disabled Buy', () => {
  // Commerce-gated pages render no buy bar at all; the others render it disabled.
  const verdicts: Array<[string, 'disabled' | 'not rendered', (p: PDPPayload) => void]> = [
    ['the selected card size is current_own_offer_status unavailable', 'disabled', (p) => {
      p.product.variants.find((v) => v.variant_id === LARGE)!.current_own_offer_status = 'unavailable';
    }],
    ['the selected row entry is current_own_offer_status unavailable', 'disabled', (p) => {
      p.offers![0].variants!.find((v) => v.variant_id.includes(LARGE))!.current_own_offer_status = 'unavailable';
    }],
    ['the offer row is current_own_offer_status unavailable', 'disabled', (p) => {
      p.offers![0].current_own_offer_status = 'unavailable';
    }],
    ['the offer row price is unverified', 'disabled', (p) => {
      p.offers![0].price_verification = 'unverified';
    }],
    ['the product is read-only', 'not rendered', (p) => {
      p.product.commerce_mode = 'read_only';
    }],
    ['the product is not purchase eligible', 'not rendered', (p) => {
      (p.product as any).purchase_eligible = false;
    }],
  ];

  it.each(verdicts)('%s: Buy on the in-stock size stays %s', (_label, outcome, apply) => {
    const p = twoSizePayload({ large: true });
    apply(p);
    renderPdp(p);
    pick(/100 mL/i);
    if (outcome === 'disabled') expect(storeButton()).toBeDisabled();
    else expect(screen.queryByRole('button', { name: /View at/ })).toBeNull();
  });
});
