// Regression identity observed on prod 2026-10-27, shaped as the explicit read-only contract.
export const CONTENT_KEY = 'ck_4dc24acc8d9242a292e8692bd11f5c09';
export const SOURCE_PRODUCT_ID = 'ext_11c49350f95d48555a9f2a6b';
export const MERCHANT_ID = 'merch_obs_f90122172d141c2d';

export function contentKeyAliasReply(): any {
  const row = { content_key: CONTENT_KEY,
    product_key: `prod::external_seed::external_seed::${SOURCE_PRODUCT_ID}`,
    merchant_id: MERCHANT_ID, product_id: SOURCE_PRODUCT_ID };
  const commerce = { state: 'unavailable', read_only: true, purchase_eligible: false,
    reason_code: 'CURRENT_OWN_OFFER_UNAVAILABLE' };
  return {
    status: 'success',
    subject: { type: 'product', id: SOURCE_PRODUCT_ID, canonical_product_ref: { ...row, platform: 'external_seed' } },
    metadata: { commerce: { ...commerce }, identity_resolution: {
      requested_product_id: CONTENT_KEY, requested_merchant_id: null,
      resolved_product_id: SOURCE_PRODUCT_ID, resolved_merchant_id: MERCHANT_ID,
      content_key_resolution: { ...row },
    } },
    modules: [{ type: 'canonical', data: {
      commerce: { ...commerce }, canonical_product_ref: { ...row },
      selected_commerce_ref: { merchant_id: MERCHANT_ID, product_id: SOURCE_PRODUCT_ID },
      pdp_payload: {
        schema_version: '1.0.0', page_type: 'product_detail',
        tracking: { page_request_id: 'content-key-regression', entry_point: 'agent' },
        commerce: { ...commerce },
        product: { product_id: SOURCE_PRODUCT_ID, source_product_id: SOURCE_PRODUCT_ID,
          merchant_id: MERCHANT_ID, title: '30 Proof Styling Cream', brand: { name: 'Blind Barber' },
          default_variant_id: SOURCE_PRODUCT_ID, variants: [],
          commerce_mode: 'read_only', purchase_eligible: false, current_own_offer_status: 'unavailable' },
        modules: [], actions: [],
      },
    } }],
  };
}
