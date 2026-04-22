import { NextRequest, NextResponse } from 'next/server';
import { safeReturnUrl } from '@/lib/returnUrl';

export const runtime = 'nodejs';
export const preferredRegion = 'home';

type CheckoutItem = {
  product_id: string;
  variant_id?: string;
  sku?: string;
  selected_options?: Record<string, string>;
  merchant_id?: string;
  offer_id?: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency?: string;
  image_url?: string;
};

type FallbackReason =
  | 'missing_offer_id'
  | 'multi_merchant'
  | 'creator_offer_mint_failed'
  | 'ucp_unavailable'
  | 'legacy_deeplink';

const OFFER_EXP_SECONDS = Math.max(
  60,
  Number(process.env.UCP_CHECKOUT_OFFER_EXP_SECONDS || 3600) || 3600,
);

const PASSTHROUGH_QUERY_KEYS = [
  'entry',
  'source',
  'embed',
  'parent_origin',
  'aurora_uid',
  'lang',
] as const;

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  return raw || null;
}

function getUcpBaseUrl(req: NextRequest): string | null {
  return (
    normalizeBaseUrl(process.env.UCP_WEB_BASE_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_UCP_WEB_BASE_URL) ||
    normalizeBaseUrl(req.nextUrl.origin)
  );
}

function getInternalMintKey(): string | null {
  return (
    String(
      process.env.UCP_INTERNAL_OFFER_MINT_KEY ||
        process.env.UCP_INTERNAL_API_KEY ||
        '',
    ).trim() || null
  );
}

function getDefaultUcpAgentProfileUrl(): string | null {
  return (
    String(
      process.env.UCP_AGENT_PROFILE_URL ||
        process.env.NEXT_PUBLIC_UCP_AGENT_PROFILE_URL ||
        '',
    ).trim() || null
  );
}

function normalizeCheckoutItem(raw: any): CheckoutItem | null {
  const productId = String(raw?.product_id || raw?.productId || '').trim();
  const title = String(raw?.title || '').trim();
  const quantityRaw = Number(raw?.quantity);
  const quantity =
    Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
  const unitPriceRaw = Number(raw?.unit_price ?? raw?.price ?? 0);
  const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : 0;
  if (!productId || !title) return null;

  return {
    product_id: productId,
    variant_id: String(raw?.variant_id || raw?.variantId || '').trim() || undefined,
    sku: String(raw?.sku || '').trim() || undefined,
    selected_options:
      raw?.selected_options &&
      typeof raw.selected_options === 'object' &&
      !Array.isArray(raw.selected_options)
        ? raw.selected_options
        : undefined,
    merchant_id: String(raw?.merchant_id || raw?.merchantId || '').trim() || undefined,
    offer_id: String(raw?.offer_id || raw?.offerId || '').trim() || undefined,
    title,
    quantity,
    unit_price: unitPrice,
    currency: String(raw?.currency || 'USD').trim().toUpperCase() || 'USD',
    image_url: String(raw?.image_url || raw?.imageUrl || '').trim() || undefined,
  };
}

function isUcpOfferId(value: unknown): boolean {
  return String(value || '').trim().startsWith('offer_v1.');
}

function toMinorAmount(unitPrice: number, currency: string): number {
  const numeric = Number(unitPrice);
  if (!Number.isFinite(numeric)) return 0;
  const normalizedCurrency = String(currency || 'USD').trim().toUpperCase();
  if (normalizedCurrency === 'JPY') return Math.max(0, Math.round(numeric));
  return Math.max(0, Math.round(numeric * 100));
}

function appendQueryParams(url: string, params: Record<string, string | null | undefined>): string {
  try {
    const nextUrl = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      const normalizedKey = String(key || '').trim();
      const normalizedValue = String(value || '').trim();
      if (!normalizedKey || !normalizedValue || nextUrl.searchParams.get(normalizedKey)) continue;
      nextUrl.searchParams.set(normalizedKey, normalizedValue);
    }
    return nextUrl.toString();
  } catch {
    return url;
  }
}

function buildUcpAgentHeader(profileUrl: string | null): string | null {
  const normalized = safeReturnUrl(profileUrl);
  if (!normalized) return null;
  return `profile="${normalized}"`;
}

async function mintOfferId(args: {
  req: NextRequest;
  item: CheckoutItem;
}): Promise<string | null> {
  const ucpBaseUrl = getUcpBaseUrl(args.req);
  const internalKey = getInternalMintKey();
  if (!ucpBaseUrl || !internalKey) return null;

  const res = await fetch(`${ucpBaseUrl}/internal/ucp/mint-offer`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pivota-internal-key': internalKey,
    },
    body: JSON.stringify({
      merchant_id: args.item.merchant_id,
      product_id: args.item.product_id,
      ...(args.item.variant_id ? { variant_id: args.item.variant_id } : {}),
      ...(args.item.title ? { title: args.item.title } : {}),
      ...(args.item.image_url ? { image_url: args.item.image_url } : {}),
      currency: args.item.currency || 'USD',
      price_minor: toMinorAmount(args.item.unit_price, args.item.currency || 'USD'),
      exp_seconds: OFFER_EXP_SECONDS,
    }),
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const json = await res.json().catch(() => null);
  const offerId = String(json?.offer_id || '').trim();
  return offerId || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = rawItems
    .map((item: unknown) => normalizeCheckoutItem(item))
    .filter(Boolean) as CheckoutItem[];

  if (!items.length) {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        detail: 'items[] is required',
      },
      { status: 400 },
    );
  }

  const merchantIds = Array.from(
    new Set(items.map((item) => String(item.merchant_id || '').trim()).filter(Boolean)),
  );
  if (merchantIds.length > 1) {
    return NextResponse.json({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'multi_merchant' satisfies FallbackReason,
    });
  }

  const missingMintInputs = items.some(
    (item) =>
      !isUcpOfferId(item.offer_id) &&
      (!item.merchant_id || !item.product_id || !item.currency),
  );
  if (missingMintInputs) {
    return NextResponse.json({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'missing_offer_id' satisfies FallbackReason,
    });
  }

  const currencies = Array.from(
    new Set(items.map((item) => String(item.currency || 'USD').trim().toUpperCase()).filter(Boolean)),
  );
  if (currencies.length !== 1) {
    return NextResponse.json({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'ucp_unavailable' satisfies FallbackReason,
    });
  }

  const ucpBaseUrl = getUcpBaseUrl(req);
  if (!ucpBaseUrl) {
    return NextResponse.json({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'ucp_unavailable' satisfies FallbackReason,
    });
  }

  const ucpAgentProfile = buildUcpAgentHeader(
    String(
      body?.ucp_agent_profile_url ||
        body?.ucpAgentProfileUrl ||
        getDefaultUcpAgentProfileUrl() ||
        '',
    ).trim() || null,
  );
  const returnUrl = safeReturnUrl(
    String(body?.return_url || body?.returnUrl || body?.return || '').trim() || null,
  );

  const offerIds: string[] = [];
  for (const item of items) {
    if (isUcpOfferId(item.offer_id)) {
      offerIds.push(String(item.offer_id).trim());
      continue;
    }
    const minted = await mintOfferId({ req, item });
    if (!minted) {
      return NextResponse.json({
        checkoutUrl: null,
        checkoutSessionId: null,
        fallbackReason: 'missing_offer_id' satisfies FallbackReason,
      });
    }
    offerIds.push(minted);
  }

  const lineItems = items.map((item, index) => ({
    item: {
      id: offerIds[index],
      ...(item.title ? { title: item.title } : {}),
      ...(item.image_url ? { image_url: item.image_url } : {}),
      ...(toMinorAmount(item.unit_price, item.currency || 'USD') > 0
        ? { price: toMinorAmount(item.unit_price, item.currency || 'USD') }
        : {}),
    },
    quantity: Math.max(1, Number(item.quantity || 1) || 1),
  }));

  const createUrl = new URL(`${ucpBaseUrl}/ucp/v1/checkout-sessions`);
  if (returnUrl) createUrl.searchParams.set('return', returnUrl);

  const createRes = await fetch(createUrl.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ucpAgentProfile ? { 'UCP-Agent': ucpAgentProfile } : {}),
    },
    body: JSON.stringify({
      currency: currencies[0],
      line_items: lineItems,
    }),
    cache: 'no-store',
  }).catch(() => null);

  if (!createRes || !createRes.ok) {
    return NextResponse.json({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'ucp_unavailable' satisfies FallbackReason,
    });
  }

  const json = await createRes.json().catch(() => null);
  const checkoutUrlRaw = String(json?.continue_url || '').trim();
  const checkoutSessionId = String(json?.id || '').trim() || null;
  if (!checkoutUrlRaw || !checkoutSessionId) {
    return NextResponse.json({
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'ucp_unavailable' satisfies FallbackReason,
    });
  }

  const passthroughParams = Object.fromEntries(
    PASSTHROUGH_QUERY_KEYS.map((key) => [
      key,
      String(body?.[key] || '').trim() || null,
    ]),
  ) as Record<string, string | null>;
  const checkoutUrl = appendQueryParams(checkoutUrlRaw, {
    ...passthroughParams,
    entry_mode: 'ucp_session',
  });

  return NextResponse.json({
    checkoutUrl,
    checkoutSessionId,
    fallbackReason: null,
  });
}
