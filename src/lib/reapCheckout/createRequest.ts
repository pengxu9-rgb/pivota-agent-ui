import { readExpectedMoney, type ExpectedMoney } from './expectedMoney';
// The buyer's "Checkout with Reap" form -> the UCP `create_checkout` arguments the gateway's Reap lane reads
// (PIVOTA-Agent docs/reap-agentic-lane.md §5.1). Pure: no env, no network, so every rule is testable.
//
// Original expected money constrains what the buyer was shown; it never prices an item,
// picks a variant or judges an offer code. The authoritative price is
// the catalog's and the merchant's (the backend's `verify_quote`), and the code is judged by the
// backend's one offer-code rule. The offer code is forwarded EXACTLY as typed — not trimmed, not
// case-folded — after only the shape the gateway's own adapter enforces (a string of 1..128 code
// points); an empty field means "no code".
import { normalizeBuyerMarket } from '@/lib/buyerMarket';
import type { ReapItemSource } from './config';
import { readSelection, type ReapSelection } from './selection';

export const MAX_OFFER_CODE_CODE_POINTS = 128;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,100}$/;
const MAX_FIELD = 200;

export type ReapBuyerForm = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  region?: string;
  /** Required: the gateway's UCP adapter refuses a shipping destination without one. */
  postal_code: string;
  country: string;
};

export type ReapCreateInput = Partial<ExpectedMoney> & {
  product_id: string;
  item_source?: ReapItemSource;
  variant_id?: string;
  selection?: ReapSelection;
  quantity: number;
  offer_code?: string;
  idempotency_key: string;
  consent: boolean;
  buyer: ReapBuyerForm;
};

export type ValidationResult =
  | { ok: true; input: ReapCreateInput; market: string }
  | { ok: false; field: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function field(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_FIELD || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

function optionalField(value: unknown): string | undefined | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return undefined;
  return field(value);
}

/** The offer code as typed, or undefined for "no code", or null for a value the shape refuses. */
export function readOfferCode(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const points = [...value].length;
  if (points < 1 || points > MAX_OFFER_CODE_CODE_POINTS) return null;
  return value;
}

export function validateReapCreateBody(body: unknown): ValidationResult {
  if (!isRecord(body)) return { ok: false, field: 'body', message: 'Request body must be a JSON object.' };
  const expectedMoney = readExpectedMoney(body);
  if (expectedMoney === null) return {ok:false,field:"expected_unit_price_minor",message:"Original unit price and currency must be supplied together."};
  const productId = field(body.product_id);
  if (!productId) return { ok: false, field: 'product_id', message: 'product_id is required.' };
  if (body.item_source !== undefined && (typeof body.item_source !== 'string' || !['reap_variant', 'cart_link'].includes(body.item_source))) {
    return { ok: false, field: 'item_source', message: 'The selected checkout source is invalid.' };
  }
  const variantId = optionalField(body.variant_id);
  if (variantId === null) return { ok: false, field: 'variant_id', message: 'Invalid selected variant.' };
  const selection = body.selection === undefined ? undefined : readSelection(body.selection);
  if (body.selection !== undefined && (!selection || selection.variant_id !== variantId || selection.item_source !== body.item_source)) return { ok:false, field:'selection', message:'Original variant selection is invalid.' };
  const quantity = body.quantity === undefined ? 1 : body.quantity;
  if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
    return { ok: false, field: 'quantity', message: 'quantity must be a whole number from 1 to 10.' };
  }
  const idem = typeof body.idempotency_key === 'string' ? body.idempotency_key : '';
  if (!IDEMPOTENCY_KEY_RE.test(idem)) {
    return { ok: false, field: 'idempotency_key', message: 'idempotency_key is required.' };
  }
  if (body.consent !== true) {
    return { ok: false, field: 'consent', message: 'Please accept the terms to continue.' };
  }
  const offerCode = readOfferCode(body.offer_code);
  if (offerCode === null) {
    return { ok: false, field: 'offer_code', message: 'Offer codes are 1 to 128 characters.' };
  }
  const b = isRecord(body.buyer) ? body.buyer : null;
  if (!b) return { ok: false, field: 'buyer', message: 'Buyer details are required.' };
  const required: Array<keyof ReapBuyerForm> = [
    'email', 'first_name', 'last_name', 'phone', 'address_line1', 'city', 'postal_code', 'country',
  ];
  const buyer: Partial<ReapBuyerForm> = {};
  for (const key of required) {
    const v = field(b[key]);
    if (!v) return { ok: false, field: `buyer.${key}`, message: `${key.replace(/_/g, ' ')} is required.` };
    buyer[key] = v;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email!)) {
    return { ok: false, field: 'buyer.email', message: 'Enter a valid email address.' };
  }
  if (!/^\+[1-9][0-9]{7,14}$/.test(buyer.phone!)) {
    return { ok: false, field: 'buyer.phone', message: 'Enter a phone number with country code, such as +14155550100.' };
  }
  for (const key of ['address_line2', 'region'] as const) {
    const v = optionalField(b[key]);
    if (v === null) return { ok: false, field: `buyer.${key}`, message: `${key.replace(/_/g, ' ')} is invalid.` };
    if (v !== undefined) buyer[key] = v;
  }
  const market = normalizeBuyerMarket(buyer.country);
  if (!market) {
    return { ok: false, field: 'buyer.country', message: 'This country is not a market Pivota can price.' };
  }
  if (['US', 'CA', 'AU'].includes(market) && !buyer.region) {
    return { ok: false, field: 'buyer.region', message: 'State or province is required for this country.' };
  }
  const regions: Record<string, RegExp> = {
    US: /^(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|AS|GU|MP|PR|VI|AA|AE|AP)$/,
    CA: /^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/,
    AU: /^(?:ACT|NSW|NT|QLD|SA|TAS|VIC|WA)$/,
  };
  if (regions[market] && !regions[market].test(buyer.region!.toUpperCase())) {
    return { ok: false, field: 'buyer.region', message: 'Enter a valid state or province code for this country.' };
  }
  if (regions[market]) buyer.region = buyer.region!.toUpperCase();
  const postcodes: Record<string, RegExp> = { US: /^[0-9]{5}(?:-[0-9]{4})?$/, CA: /^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z] ?[0-9][ABCEGHJ-NPRSTV-Z][0-9]$/i, AU: /^[0-9]{4}$/, SG: /^[0-9]{6}$/ };
  if (postcodes[market] && !postcodes[market].test(buyer.postal_code!)) {
    return { ok: false, field: 'buyer.postal_code', message: 'Enter a valid postcode for this country.' };
  }
  buyer.country = market;
  if (selection && expectedMoney && (selection.unit_price_minor !== expectedMoney.expected_unit_price_minor || selection.currency !== expectedMoney.expected_currency)) return {ok:false,field:"expected_unit_price_minor",message:"The displayed price changed. Checkout was not created."};
  if (selection && (selection.market !== market || selection.quantity !== quantity)) return {ok:false,field:'selection',message:'Original variant selection does not match this request.'};
  return {
    ok: true,
    market,
    input: {
      ...expectedMoney,
      product_id: productId,
      ...(body.item_source !== undefined ? { item_source: body.item_source as ReapItemSource } : {}),
      ...(variantId !== undefined ? { variant_id: variantId } : {}),
      ...(selection ? {selection} : {}),
      quantity,
      ...(offerCode !== undefined ? { offer_code: offerCode } : {}),
      idempotency_key: idem,
      consent: true,
      buyer: buyer as ReapBuyerForm,
    },
  };
}

/** The UCP `create_checkout` arguments. `consentVersion` is sent only because `input.consent` is true. */
export function buildCreateCheckoutArgs(
  input: ReapCreateInput,
  opts: { consentVersion: string; profileUrl?: string | null; expectedMerchantDomain: string; itemSource?: ReapItemSource },
): Record<string, unknown> {
  const b = input.buyer;
  const destination: Record<string, string> = {
    first_name: b.first_name,
    last_name: b.last_name,
    phone_number: b.phone,
    street_address: b.address_line1,
    address_locality: b.city,
    postal_code: b.postal_code,
    address_country: b.country,
  };
  if (b.address_line2) destination.extended_address = b.address_line2;
  if (b.region) destination.address_region = b.region;
  return {
    meta: {
      ...(opts.profileUrl ? { 'ucp-agent': { profile: opts.profileUrl } } : {}),
      'idempotency-key': `pivota-ui-reap:${input.idempotency_key}`,
    },
    checkout: {
      line_items: [{ item: { id: input.product_id }, quantity: input.quantity }],
      buyer: { email: b.email, consent_version: opts.consentVersion },
      context: { address_country: b.country },
      fulfillment: { methods: [{ type: 'shipping', destinations: [destination] }] },
      ...(input.offer_code !== undefined ? { discounts: { codes: [input.offer_code] } } : {}),
      // The seller the buyer was shown, from SERVER config (never the browser): the gateway refuses the
      // create (`ucp_seller_mismatch`) unless every route would sell from exactly this merchant (§5.4).
      reap: { ...readExpectedMoney(input), expected_merchant_domain: opts.expectedMerchantDomain, ...(opts.itemSource ? { item_source: opts.itemSource } : {}), ...(input.variant_id ? { selected_variant_id: input.variant_id } : {}), ...(input.selection ? {selection:input.selection} : {}) },
    },
  };
}
