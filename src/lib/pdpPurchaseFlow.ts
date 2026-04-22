import type { Offer, Variant } from '@/features/pdp/types';
import { findMatchingOfferVariant } from '@/features/pdp/utils/offerVariantMatching';
import {
  isExternalAgentEntry,
  resolveExternalAgentHomeUrl,
  safeReturnUrl,
} from '@/lib/returnUrl';
import type { HostedCheckoutItem } from '@/lib/ucpCheckout';

type ProductPriceLike =
  | number
  | {
      current?: {
        amount?: number;
        currency?: string;
      };
      amount?: number;
      currency?: string;
    };

export type PurchaseFlowProduct = {
  product_id: string;
  merchant_id?: string | null;
  title?: string | null;
  image_url?: string | null;
  source?: string | null;
  product_source?: string | null;
  productSource?: string | null;
  platform?: string | null;
  purchase_route?: string | null;
  purchaseRoute?: string | null;
  commerce_mode?: string | null;
  commerceMode?: string | null;
  external_redirect_url?: string | null;
  externalRedirectUrl?: string | null;
  affiliate_url?: string | null;
  affiliateUrl?: string | null;
  external_url?: string | null;
  externalUrl?: string | null;
  redirect_url?: string | null;
  redirectUrl?: string | null;
  destination_url?: string | null;
  destinationUrl?: string | null;
  canonical_url?: string | null;
  canonicalUrl?: string | null;
  source_url?: string | null;
  sourceUrl?: string | null;
  url?: string | null;
  product_url?: string | null;
  productUrl?: string | null;
  variants?: Variant[] | null;
  price?: ProductPriceLike | null;
};

export type CheckoutTargetResult =
  | {
      kind: 'external';
      url: string;
      notice: string;
      variantId?: string;
      offerId?: string | null;
    }
  | {
      kind: 'checkout';
      href: string;
      variantId: string;
      offerId?: string | null;
      checkoutItems: HostedCheckoutItem[];
    }
  | {
      kind: 'error';
      code: 'MISSING_INFO' | 'MISSING_REDIRECT' | 'VARIANT_UNAVAILABLE';
    };

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function decodeBase64UrlJson(input: string): Record<string, unknown> | null {
  if (!input) return null;
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function buildExternalRedirectNotice(url: string): string {
  const fallback = 'Redirecting to external website in a new tab...';

  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token') || '';
    if (token) {
      const payloadPart = token.split('.')[0] || '';
      const decoded = decodeBase64UrlJson(payloadPart);
      const dest = decoded && typeof decoded.dest === 'string' ? decoded.dest : '';
      if (dest) {
        try {
          const host = new URL(dest).hostname;
          return host ? `Redirecting to ${host} in a new tab...` : fallback;
        } catch {
          return fallback;
        }
      }
    }

    return parsed.hostname ? `Redirecting to ${parsed.hostname} in a new tab...` : fallback;
  } catch {
    return fallback;
  }
}

function isExternalOfferRoute(offer: unknown): boolean {
  if (!offer || typeof offer !== 'object') return false;
  const typed = offer as any;
  const purchaseRoute = String(typed.purchase_route || typed.purchaseRoute || '').trim().toLowerCase();
  const commerceMode = String(typed.commerce_mode || typed.commerceMode || '').trim().toLowerCase();
  const checkoutHandoff = String(typed.checkout_handoff || typed.checkoutHandoff || '').trim().toLowerCase();
  return (
    ['affiliate_outbound', 'merchant_site', 'external_redirect', 'links_out'].includes(purchaseRoute) ||
    ['links_out', 'affiliate_outbound', 'merchant_site'].includes(commerceMode) ||
    checkoutHandoff === 'redirect'
  );
}

export function getExternalRedirectUrlFromOffer(offer: unknown): string | null {
  if (!offer || typeof offer !== 'object') return null;
  const typed = offer as any;
  const direct =
    normalizeHttpUrl(typed.external_redirect_url) ||
    normalizeHttpUrl(typed.externalRedirectUrl) ||
    normalizeHttpUrl(typed.affiliate_url) ||
    normalizeHttpUrl(typed.affiliateUrl) ||
    normalizeHttpUrl(typed.external_url) ||
    normalizeHttpUrl(typed.externalUrl) ||
    normalizeHttpUrl(typed.redirect_url) ||
    normalizeHttpUrl(typed.redirectUrl);
  if (direct) return direct;

  const action = typed.action;
  if (action && typeof action === 'object') {
    const actionUrl =
      normalizeHttpUrl((action as any).redirect_url) ||
      normalizeHttpUrl((action as any).redirectUrl) ||
      normalizeHttpUrl((action as any).url) ||
      normalizeHttpUrl((action as any).href);
    if (actionUrl) return actionUrl;
  }

  if (!isExternalOfferRoute(typed)) return null;
  return (
    normalizeHttpUrl(typed.merchant_checkout_url) ||
    normalizeHttpUrl(typed.merchantCheckoutUrl) ||
    normalizeHttpUrl(typed.checkout_url) ||
    normalizeHttpUrl(typed.checkoutUrl) ||
    normalizeHttpUrl(typed.purchase_url) ||
    normalizeHttpUrl(typed.purchaseUrl) ||
    normalizeHttpUrl(typed.url) ||
    normalizeHttpUrl(typed.product_url) ||
    normalizeHttpUrl(typed.productUrl) ||
    normalizeHttpUrl(typed.destination_url) ||
    normalizeHttpUrl(typed.destinationUrl) ||
    normalizeHttpUrl(typed.canonical_url) ||
    normalizeHttpUrl(typed.canonicalUrl) ||
    normalizeHttpUrl(typed.source_url) ||
    normalizeHttpUrl(typed.sourceUrl)
  );
}

export function getExternalRedirectUrlFromProduct(product: unknown): string | null {
  if (!product || typeof product !== 'object') return null;
  const typed = product as any;
  const direct =
    normalizeHttpUrl(typed.external_redirect_url) ||
    normalizeHttpUrl(typed.externalRedirectUrl) ||
    normalizeHttpUrl(typed.affiliate_url) ||
    normalizeHttpUrl(typed.affiliateUrl) ||
    normalizeHttpUrl(typed.external_url) ||
    normalizeHttpUrl(typed.externalUrl) ||
    normalizeHttpUrl(typed.redirect_url) ||
    normalizeHttpUrl(typed.redirectUrl);
  if (direct) return direct;

  const merchantId = String(typed.merchant_id || typed.merchantId || '').trim().toLowerCase();
  const source = String(typed.source || typed.product_source || typed.productSource || '').trim().toLowerCase();
  const platform = String(typed.platform || '').trim().toLowerCase();
  const purchaseRoute = String(typed.purchase_route || typed.purchaseRoute || '').trim().toLowerCase();
  const commerceMode = String(typed.commerce_mode || typed.commerceMode || '').trim().toLowerCase();
  const isExternalSeed =
    merchantId === 'external_seed' ||
    source === 'external_seed' ||
    source === 'external_product_seeds' ||
    platform === 'external' ||
    ['affiliate_outbound', 'merchant_site', 'external_redirect', 'links_out'].includes(purchaseRoute) ||
    ['links_out', 'affiliate_outbound', 'merchant_site'].includes(commerceMode);
  if (!isExternalSeed) return null;

  return (
    normalizeHttpUrl(typed.destination_url) ||
    normalizeHttpUrl(typed.destinationUrl) ||
    normalizeHttpUrl(typed.canonical_url) ||
    normalizeHttpUrl(typed.canonicalUrl) ||
    normalizeHttpUrl(typed.source_url) ||
    normalizeHttpUrl(typed.sourceUrl) ||
    normalizeHttpUrl(typed.url) ||
    normalizeHttpUrl(typed.product_url) ||
    normalizeHttpUrl(typed.productUrl)
  );
}

export function isExternalCtaTarget(args: {
  offer: unknown;
  product: unknown;
  merchantId: string;
  redirectUrl: string | null;
}): boolean {
  if (args.redirectUrl) return true;
  if (isExternalOfferRoute(args.offer)) return true;
  const merchantId = String(args.merchantId || '').trim().toLowerCase();
  if (merchantId === 'external_seed') return true;
  const product = args.product && typeof args.product === 'object' ? (args.product as any) : null;
  if (!product) return false;
  const source = String(product.source || product.product_source || product.productSource || '').trim().toLowerCase();
  const platform = String(product.platform || '').trim().toLowerCase();
  return source === 'external_seed' || source === 'external_product_seeds' || platform === 'external';
}

function normalizeOfferSelectedOptions(value: unknown): Variant['options'] | undefined {
  if (Array.isArray(value)) {
    const options = value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const name = String((item as any).name || '').trim();
        const optionValue = String((item as any).value || '').trim();
        if (!name || !optionValue) return null;
        return { name, value: optionValue };
      })
      .filter(Boolean) as NonNullable<Variant['options']>;
    return options.length ? options : undefined;
  }

  if (value && typeof value === 'object') {
    const options = Object.entries(value as Record<string, unknown>)
      .map(([name, optionValue]) => {
        const normalizedName = String(name || '').trim();
        const normalizedValue = String(optionValue || '').trim();
        if (!normalizedName || !normalizedValue) return null;
        return { name: normalizedName, value: normalizedValue };
      })
      .filter(Boolean) as NonNullable<Variant['options']>;
    return options.length ? options : undefined;
  }

  return undefined;
}

export function resolveOfferVariantForCheckout(args: {
  variant: Variant;
  offer: Offer | Record<string, unknown> | null;
  product: PurchaseFlowProduct;
  merchantId: string;
  productId: string;
}): Variant | null {
  const matchedOfferVariant = findMatchingOfferVariant(args.offer as Offer | null, args.variant);
  if (matchedOfferVariant) return matchedOfferVariant;

  const offer = args.offer as any;
  const offerVariantId = String(
    offer?.variant_id ||
      offer?.variantId ||
      offer?.selected_variant_id ||
      offer?.selectedVariantId ||
      offer?.platform_variant_id ||
      offer?.platformVariantId ||
      offer?.shopify_variant_id ||
      offer?.shopifyVariantId ||
      offer?.sku_id ||
      offer?.skuId ||
      '',
  ).trim();

  if (offerVariantId) {
    const offerSelectedOptions = normalizeOfferSelectedOptions(
      offer?.selected_options ||
        offer?.selectedOptions ||
        offer?.variant_options ||
        offer?.variantOptions ||
        offer?.options,
    );
    const offerVariantTitle = String(offer?.variant_title || offer?.variantTitle || '').trim();
    return {
      ...args.variant,
      variant_id: offerVariantId,
      ...(offerVariantTitle ? { title: offerVariantTitle } : {}),
      ...(offerSelectedOptions ? { options: offerSelectedOptions } : {}),
      sku_id: String(offer?.sku_id || offer?.skuId || args.variant.sku_id || '').trim() || undefined,
    };
  }

  const sameMerchant = args.merchantId === String(args.product.merchant_id || '').trim();
  const sameProduct = args.productId === String(args.product.product_id || '').trim();
  if (sameMerchant && sameProduct) return args.variant;

  const variants = Array.isArray(args.product.variants) ? args.product.variants : [];
  if (variants.length <= 1) {
    return {
      ...args.variant,
      variant_id: args.productId || args.variant.variant_id,
    };
  }

  return null;
}

function readProductPriceAmount(product: PurchaseFlowProduct): number {
  const price = product.price;
  if (typeof price === 'number') return price;
  if (!price || typeof price !== 'object') return 0;
  return Number(price.current?.amount ?? price.amount ?? 0) || 0;
}

function readProductCurrency(product: PurchaseFlowProduct): string {
  const price = product.price;
  if (price && typeof price === 'object') {
    return String(price.current?.currency || price.currency || 'USD').trim() || 'USD';
  }
  return 'USD';
}

export function resolveCheckoutTarget(args: {
  product: PurchaseFlowProduct;
  offers?: Offer[];
  variant: Variant;
  quantity: number;
  merchantId?: string;
  productId?: string;
  offerId?: string | null;
  searchParams: URLSearchParams;
}): CheckoutTargetResult {
  const resolvedMerchantId =
    String(args.merchantId || args.product.merchant_id || '').trim();
  const resolvedProductId =
    String(args.productId || args.product.product_id || '').trim();
  const offers = Array.isArray(args.offers) ? args.offers : [];
  const offer =
    args.offerId && offers.length
      ? offers.find((entry) => String(entry.offer_id || '').trim() === String(args.offerId))
      : null;

  const offerRedirectUrl = offer ? getExternalRedirectUrlFromOffer(offer) : null;
  const offerIsExternal = offer
    ? isExternalCtaTarget({
        offer,
        product: null,
        merchantId: resolvedMerchantId,
        redirectUrl: offerRedirectUrl,
      })
    : false;
  const productRedirectUrl =
    !offer || offerIsExternal ? getExternalRedirectUrlFromProduct(args.product) : null;
  const redirectUrl = offerRedirectUrl || productRedirectUrl;
  const isExternal = offer
    ? isExternalCtaTarget({
        offer,
        product: null,
        merchantId: resolvedMerchantId,
        redirectUrl,
      })
    : isExternalCtaTarget({
        offer: null,
        product: args.product,
        merchantId: resolvedMerchantId,
        redirectUrl,
      });

  if (isExternal) {
    if (!redirectUrl) return { kind: 'error', code: 'MISSING_REDIRECT' };
    return {
      kind: 'external',
      url: redirectUrl,
      notice: buildExternalRedirectNotice(redirectUrl),
      variantId: args.variant.variant_id,
      offerId: offer?.offer_id || null,
    };
  }

  if (!resolvedMerchantId || !resolvedProductId) {
    return { kind: 'error', code: 'MISSING_INFO' };
  }

  const purchaseVariant = resolveOfferVariantForCheckout({
    variant: args.variant,
    offer: offer || null,
    product: args.product,
    merchantId: resolvedMerchantId,
    productId: resolvedProductId,
  });

  if (!purchaseVariant) {
    return { kind: 'error', code: 'VARIANT_UNAVAILABLE' };
  }

  const selectedOptions =
    Array.isArray(purchaseVariant.options) && purchaseVariant.options.length > 0
      ? Object.fromEntries(purchaseVariant.options.map((option) => [option.name, option.value]))
      : undefined;

  const offerItemPrice =
    offer != null
      ? Number(
          purchaseVariant.price?.current.amount ??
            offer.price?.amount ??
            (offer as any)?.price_amount ??
            (offer as any)?.price ??
            0,
        )
      : undefined;

  const checkoutItems: HostedCheckoutItem[] = [
    {
      product_id: resolvedProductId,
      merchant_id: resolvedMerchantId,
      title: String(args.product.title || '').trim() || 'Product',
      quantity: args.quantity,
      unit_price:
        offerItemPrice != null
          ? offerItemPrice
          : purchaseVariant.price?.current.amount ?? readProductPriceAmount(args.product),
      currency: String(
        purchaseVariant.price?.current.currency ||
          offer?.price?.currency ||
          readProductCurrency(args.product) ||
          'USD',
      ),
      image_url: purchaseVariant.image_url || args.product.image_url || '/placeholder.svg',
      variant_id: purchaseVariant.variant_id,
      sku: purchaseVariant.sku_id,
      selected_options: selectedOptions,
      offer_id: offer?.offer_id || undefined,
    },
  ];

  const params = new URLSearchParams();
  params.set('items', JSON.stringify(checkoutItems));

  const explicitReturnRaw =
    String(
      args.searchParams.get('return') ||
        args.searchParams.get('return_url') ||
        args.searchParams.get('returnUrl') ||
        '',
    ).trim();
  const explicitReturn = safeReturnUrl(explicitReturnRaw);
  const entryFromQuery = String(args.searchParams.get('entry') || '').trim();

  if (explicitReturn) {
    params.set('return', explicitReturn);
  } else if (isExternalAgentEntry(entryFromQuery)) {
    const externalHome = resolveExternalAgentHomeUrl(entryFromQuery);
    if (externalHome) params.set('return', externalHome);
  }

  const passthroughKeys = [
    'embed',
    'entry',
    'parent_origin',
    'parentOrigin',
    'aurora_uid',
    'lang',
    'source',
  ];
  for (const key of passthroughKeys) {
    const value = String(args.searchParams.get(key) || '').trim();
    if (!value) continue;
    if (!params.has(key)) params.set(key, value);
  }

  return {
    kind: 'checkout',
    href: `/order?${params.toString()}`,
    variantId: purchaseVariant.variant_id,
    offerId: offer?.offer_id || null,
    checkoutItems,
  };
}
