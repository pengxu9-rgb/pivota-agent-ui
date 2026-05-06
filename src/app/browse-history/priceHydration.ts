import {
  getPdpV2,
  resolveProductCandidates,
} from '@/lib/api';
import {
  hasPositiveHistoryPrice,
  historyKey,
  type HistoryItem,
} from './historyItems';

function lookupMerchantId(value: string | undefined): string | undefined {
  const merchantId = String(value || '').trim();
  if (!merchantId) return undefined;
  if (merchantId.toLowerCase() === 'external_seed') return undefined;
  return merchantId;
}

export function extractPriceAmount(value: any): number {
  const candidates = [
    value,
    value?.amount,
    value?.value,
    value?.price_amount,
    value?.current,
    value?.current?.amount,
    value?.current?.value,
    value?.sale,
    value?.sale?.amount,
    value?.min,
    value?.min?.amount,
  ];
  for (const candidate of candidates) {
    const amount =
      typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
          ? Number(candidate)
          : NaN;
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

export function extractPdpPriceAmount(response: any, merchantId: string): number {
  const canonicalModule = Array.isArray(response?.modules)
    ? response.modules.find((module: any) => String(module?.type || '').trim() === 'canonical')
    : null;
  const payload = canonicalModule?.data?.pdp_payload || response?.pdp_payload || response;
  const product = payload?.product || response?.product;
  const offers = [
    ...(Array.isArray(payload?.offers) ? payload.offers : []),
    ...(Array.isArray(response?.offers) ? response.offers : []),
  ];
  const matchingOffers = merchantId
    ? offers.filter((offer: any) => String(offer?.merchant_id || '').trim() === merchantId)
    : offers;
  const candidates = [
    product?.price,
    product?.pricing,
    ...(Array.isArray(product?.variants) ? product.variants.map((variant: any) => variant?.price) : []),
    ...matchingOffers.map((offer: any) => offer?.price),
    ...offers.map((offer: any) => offer?.price),
  ];

  for (const candidate of candidates) {
    const price = extractPriceAmount(candidate);
    if (price > 0) return price;
  }
  return 0;
}

export async function resolveHistoryItemPrice(item: HistoryItem): Promise<number> {
  const displayMerchantId = String(item.merchant_id || '').trim();
  const apiMerchantId = lookupMerchantId(item.merchant_id);

  try {
    const resolved = await resolveProductCandidates({
      product_id: item.product_id,
      merchant_id: apiMerchantId,
      limit: 10,
      timeout_ms: 4500,
    });
    const offers = Array.isArray(resolved?.offers) ? resolved.offers : [];
    const matchingOffer =
      offers.find((offer) => String(offer?.merchant_id || '').trim() === displayMerchantId) || offers[0];
    const price = extractPriceAmount(matchingOffer?.price);
    if (price > 0) return price;
  } catch {
    // Fall through to PDP price lookup.
  }

  try {
    const pdp = await getPdpV2({
      product_id: item.product_id,
      merchant_id: apiMerchantId,
      include: ['offers', 'variant_selector'],
      timeout_ms: 6500,
    });
    return extractPdpPriceAmount(pdp, displayMerchantId);
  } catch {
    return 0;
  }
}

export async function hydrateZeroPriceItems(items: HistoryItem[]): Promise<HistoryItem[]> {
  const targets = items.filter((item) => !hasPositiveHistoryPrice(item)).slice(0, 24);
  if (targets.length === 0) return items;

  const pricesByKey = new Map<string, number>();
  await Promise.all(
    targets.map(async (item) => {
      const price = await resolveHistoryItemPrice(item);
      if (price > 0) pricesByKey.set(historyKey(item), price);
    }),
  );

  if (pricesByKey.size === 0) return items;
  return items.map((item) => {
    const hydratedPrice = pricesByKey.get(historyKey(item));
    return hydratedPrice ? { ...item, price: hydratedPrice } : item;
  });
}
