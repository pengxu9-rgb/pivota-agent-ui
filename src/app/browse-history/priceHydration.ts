import {
  getPdpV2,
  resolveProductCandidates,
} from '@/lib/api';
import {
  extractPositivePriceAmount,
  extractPositivePriceFromProductLike,
} from '@/lib/price';
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
  return extractPositivePriceAmount(value);
}

export function extractPdpPriceAmount(response: any, merchantId: string): number {
  const canonicalModule = Array.isArray(response?.modules)
    ? response.modules.find((module: any) => String(module?.type || '').trim() === 'canonical')
    : null;
  const payload = canonicalModule?.data?.pdp_payload || response?.pdp_payload || response;
  return extractPositivePriceFromProductLike(payload, { merchantId });
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
  const targets = items.filter((item) => !hasPositiveHistoryPrice(item));
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
