import { resolveExternalAgentHomeUrl, safeReturnUrl } from '@/lib/returnUrl';

export type HostedCheckoutItem = {
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

export type HostedCheckoutFallbackReason =
  | 'missing_offer_id'
  | 'multi_merchant'
  | 'creator_offer_mint_failed'
  | 'ucp_unavailable'
  | 'legacy_deeplink';

export type HostedCheckoutBlockedReason = 'multi_merchant';

type HostedCheckoutQueryContext = {
  searchParams?: URLSearchParams;
  returnUrl?: string | null;
};

type CreateUcpCheckoutSessionResult = {
  checkoutUrl: string | null;
  checkoutSessionId: string | null;
  fallbackReason: HostedCheckoutFallbackReason | null;
};

const CHECKOUT_PASSTHROUGH_KEYS = [
  'embed',
  'entry',
  'parent_origin',
  'parentOrigin',
  'aurora_uid',
  'lang',
  'source',
] as const;

function firstSearchParam(
  searchParams: URLSearchParams | undefined,
  keys: string[],
): string | null {
  if (!searchParams) return null;
  for (const key of keys) {
    const value = String(searchParams.get(key) || '').trim();
    if (value) return value;
  }
  return null;
}

function safeString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function buildLegacyOrderHref(args: {
  items: HostedCheckoutItem[];
  context?: HostedCheckoutQueryContext;
  fallbackReason?: HostedCheckoutFallbackReason | null;
}): string {
  const params = new URLSearchParams();
  params.set('items', JSON.stringify(args.items));
  params.set('entry_mode', 'legacy_items');
  if (args.fallbackReason) params.set('fallback_reason', args.fallbackReason);

  const searchParams = args.context?.searchParams;
  const explicitReturn =
    args.context?.returnUrl != null
      ? safeReturnUrl(args.context.returnUrl)
      : safeReturnUrl(
          firstSearchParam(searchParams, ['return', 'return_url', 'returnUrl']),
        );
  const entryFromQuery = firstSearchParam(searchParams, ['entry']);

  if (explicitReturn) {
    params.set('return', explicitReturn);
  } else if (entryFromQuery) {
    const externalHome = resolveExternalAgentHomeUrl(entryFromQuery);
    if (externalHome) params.set('return', externalHome);
  }

  for (const key of CHECKOUT_PASSTHROUGH_KEYS) {
    const value = safeString(searchParams?.get(key));
    if (!value) continue;
    const normalizedKey = key === 'parentOrigin' ? 'parent_origin' : key;
    if (!params.has(normalizedKey)) params.set(normalizedKey, value);
  }

  return `/order?${params.toString()}`;
}

export async function createUcpCheckoutSession(args: {
  items: HostedCheckoutItem[];
  context?: HostedCheckoutQueryContext;
}): Promise<CreateUcpCheckoutSessionResult> {
  const searchParams = args.context?.searchParams;
  const returnUrl =
    args.context?.returnUrl != null
      ? safeReturnUrl(args.context.returnUrl)
      : safeReturnUrl(
          firstSearchParam(searchParams, ['return', 'return_url', 'returnUrl']),
        );

  try {
    const res = await fetch('/api/ucp/checkout-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: args.items,
        ...(returnUrl ? { return_url: returnUrl } : {}),
        ...(searchParams
          ? {
              entry: firstSearchParam(searchParams, ['entry']),
              source: firstSearchParam(searchParams, ['source']),
              embed: firstSearchParam(searchParams, ['embed']),
              parent_origin: firstSearchParam(searchParams, [
                'parent_origin',
                'parentOrigin',
              ]),
              aurora_uid: firstSearchParam(searchParams, ['aurora_uid']),
              lang: firstSearchParam(searchParams, ['lang']),
            }
          : {}),
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | (CreateUcpCheckoutSessionResult & {
          detail?: string | null;
          fallback_reason?: HostedCheckoutFallbackReason | null;
          checkout_url?: string | null;
          checkout_session_id?: string | null;
        })
      | null;

    if (!res.ok) {
      return {
        checkoutUrl: null,
        checkoutSessionId: null,
        fallbackReason:
          json?.fallbackReason || json?.fallback_reason || 'ucp_unavailable',
      };
    }

    return {
      checkoutUrl: safeString(json?.checkoutUrl || json?.checkout_url),
      checkoutSessionId: safeString(
        json?.checkoutSessionId || json?.checkout_session_id,
      ),
      fallbackReason:
        (json?.fallbackReason || json?.fallback_reason || null) ?? null,
    };
  } catch {
    return {
      checkoutUrl: null,
      checkoutSessionId: null,
      fallbackReason: 'ucp_unavailable',
    };
  }
}

export async function resolveHostedCheckoutUrl(args: {
  items: HostedCheckoutItem[];
  context?: HostedCheckoutQueryContext;
}): Promise<{
  status: 'ready' | 'blocked';
  url: string | null;
  entryMode: 'ucp_session' | 'legacy_items' | null;
  fallbackReason: HostedCheckoutFallbackReason | null;
  blockedReason: HostedCheckoutBlockedReason | null;
  message: string | null;
}> {
  const ucpResult = await createUcpCheckoutSession(args);
  if (ucpResult.checkoutUrl) {
    return {
      status: 'ready',
      url: ucpResult.checkoutUrl,
      entryMode: 'ucp_session',
      fallbackReason: null,
      blockedReason: null,
      message: null,
    };
  }

  if (ucpResult.fallbackReason === 'multi_merchant') {
    return {
      status: 'blocked',
      url: null,
      entryMode: null,
      fallbackReason: 'multi_merchant',
      blockedReason: 'multi_merchant',
      message:
        'Items from multiple sellers cannot be checked out together yet. Please purchase each seller separately.',
    };
  }

  return {
    status: 'ready',
    url: buildLegacyOrderHref({
      items: args.items,
      context: args.context,
      fallbackReason: ucpResult.fallbackReason,
    }),
    entryMode: 'legacy_items',
    fallbackReason: ucpResult.fallbackReason,
    blockedReason: null,
    message: null,
  };
}
