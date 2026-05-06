type AnyRecord = Record<string, any>;

function asRecord(value: any): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numericAmount(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value === 'string') {
    const amount = Number(value.trim().replace(/,/g, ''));
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  return 0;
}

export function extractPositivePriceAmount(value: any): number {
  const record = asRecord(value);
  const candidates = [
    value,
    record.amount,
    record.value,
    record.price_amount,
    record.price,
    record.current_price,
    record.sale_price,
    record.min_price,
    asRecord(record.current).amount,
    asRecord(record.current).value,
    asRecord(record.sale).amount,
    asRecord(record.sale).value,
    asRecord(record.min).amount,
    asRecord(record.min).value,
  ];

  for (const candidate of candidates) {
    const amount = numericAmount(candidate);
    if (amount > 0) return amount;
  }
  return 0;
}

export function extractMoneyCurrency(value: any, fallback = 'USD'): string {
  const record = asRecord(value);
  const current = asRecord(record.current);
  return (
    String(
      record.currency ||
        record.currency_code ||
        record.price_currency ||
        current.currency ||
        current.currency_code ||
        fallback,
    ).trim() || fallback
  );
}

function collectIds(value: any, keys: string[]): string[] {
  const record = asRecord(value);
  const ids: string[] = [];
  const add = (raw: any) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const nestedKey of ['id', 'product_id', 'productId', 'variant_id', 'variantId', 'sku', 'sku_id']) {
        add(raw[nestedKey]);
      }
      return;
    }
    const text = String(raw || '').trim();
    if (text && !ids.includes(text)) ids.push(text);
  };
  for (const key of keys) add(record[key]);
  return ids;
}

function payloadParts(payload: any): { product: AnyRecord; variants: AnyRecord[]; offers: AnyRecord[] } {
  const root = asRecord(payload);
  const product = asRecord(root.product);
  const resolvedProduct = Object.keys(product).length ? product : root;
  const variants = [
    ...(Array.isArray(resolvedProduct.variants) ? resolvedProduct.variants : []),
    ...(Array.isArray(root.variants) ? root.variants : []),
  ].map(asRecord).filter((item) => Object.keys(item).length > 0);
  const offers = [
    ...(Array.isArray(resolvedProduct.offers) ? resolvedProduct.offers : []),
    ...(Array.isArray(root.offers) ? root.offers : []),
  ].map(asRecord).filter((item) => Object.keys(item).length > 0);

  if (Array.isArray(root.modules)) {
    for (const pdpModule of root.modules) {
      const pdpPayload = asRecord(asRecord(asRecord(pdpModule).data).pdp_payload);
      if (!Object.keys(pdpPayload).length) continue;
      const nested = payloadParts(pdpPayload);
      variants.push(...nested.variants);
      offers.push(...nested.offers);
      if (!Object.keys(product).length && Object.keys(nested.product).length) {
        return { product: nested.product, variants, offers };
      }
    }
  }

  return { product: resolvedProduct, variants, offers };
}

export function extractPositivePriceFromProductLike(
  payload: any,
  options: { productId?: string | null; merchantId?: string | null } = {},
): number {
  const { product, variants, offers } = payloadParts(payload);
  const productId = String(options.productId || '').trim();
  const merchantId = String(options.merchantId || '').trim();

  if (productId) {
    for (const variant of variants) {
      const ids = collectIds(variant, [
        'variant_id',
        'variantId',
        'id',
        'sku',
        'sku_id',
        'skuId',
        'platform_variant_id',
        'platformVariantId',
        'external_variant_id',
        'externalVariantId',
        'product_id',
        'productId',
      ]);
      if (!ids.includes(productId)) continue;
      const price = extractPositivePriceAmount(
        variant.price || variant.pricing || variant.price_amount || variant.current_price,
      );
      if (price > 0) return price;
    }
  }

  const matchingOffers = offers.filter((offer) => {
    const offerMerchantId = String(offer.merchant_id || offer.merchantId || '').trim();
    const offerIds = collectIds(offer, [
      'offer_id',
      'offerId',
      'id',
      'product_id',
      'productId',
      'platform_product_id',
      'platformProductId',
      'external_product_id',
      'externalProductId',
      'variant_id',
      'variantId',
      'sku',
      'sku_id',
    ]);
    return (!merchantId || !offerMerchantId || offerMerchantId === merchantId) && (!productId || offerIds.includes(productId));
  });

  for (const offer of matchingOffers.length ? matchingOffers : offers) {
    const price = extractPositivePriceAmount(
      offer.price || offer.pricing || offer.price_amount || offer.current_price,
    );
    if (price > 0) return price;
  }

  for (const candidate of [product.price, product.pricing, product.price_amount, product.current_price]) {
    const price = extractPositivePriceAmount(candidate);
    if (price > 0) return price;
  }

  for (const variant of variants) {
    const price = extractPositivePriceAmount(
      variant.price || variant.pricing || variant.price_amount || variant.current_price,
    );
    if (price > 0) return price;
  }

  return 0;
}
