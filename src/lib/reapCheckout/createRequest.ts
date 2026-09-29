// The buyer's "Checkout with Reap" form -> the UCP `create_checkout` arguments the gateway's Reap lane reads
// (PIVOTA-Agent docs/reap-agentic-lane.md §5.1). Pure: no env, no network, so every rule is testable.
//
// What this module does NOT do: price anything, pick a variant, or judge an offer code. The price is
// the catalog's and the merchant's (the backend's `verify_quote`), and the code is judged by the
// backend's one offer-code rule. The offer code is forwarded EXACTLY as typed — not trimmed, not
// case-folded — after only the shape the gateway's own adapter enforces (a string of 1..128 code
// points); an empty field means "no code".
import { normalizeBuyerMarket } from '@/lib/buyerMarket';

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

export type ReapCreateInput = {
  product_id: string;
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
  const productId = field(body.product_id);
  if (!productId) return { ok: false, field: 'product_id', message: 'product_id is required.' };
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
  for (const key of ['address_line2', 'region'] as const) {
    const v = optionalField(b[key]);
    if (v === null) return { ok: false, field: `buyer.${key}`, message: `${key.replace(/_/g, ' ')} is invalid.` };
    if (v !== undefined) buyer[key] = v;
  }
  const market = normalizeBuyerMarket(buyer.country);
  if (!market) {
    return { ok: false, field: 'buyer.country', message: 'This country is not a market Pivota can price.' };
  }
  buyer.country = market;
  return {
    ok: true,
    market,
    input: {
      product_id: productId,
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
  opts: { consentVersion: string; profileUrl?: string | null },
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
    },
  };
}
