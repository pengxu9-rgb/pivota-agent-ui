import type { Product } from '@/features/pdp/types';
import type { Provider, ServiceListing, ServiceType } from './types';
import { getProviderListings } from './types';

const BEAUTY_SERVICE_HINTS: Array<{ pattern: RegExp; types: ServiceType[] }> = [
  { pattern: /lash|mascara|eye\b|eyelash/i, types: ['lashes', 'eyebrow-tattoo'] },
  { pattern: /brow|eyebrow/i, types: ['eyebrow-tattoo', 'lashes'] },
  { pattern: /hair|scalp|shampoo|conditioner/i, types: ['hair-treatment', 'scalp-care', 'hair-cut'] },
  { pattern: /nail|manicure|pedicure/i, types: ['nails'] },
  { pattern: /makeup|lip|foundation|concealer|palette|blush/i, types: ['makeup', 'bridal-makeup'] },
  { pattern: /body|wax/i, types: ['body-care', 'waxing'] },
  { pattern: /massage/i, types: ['massage'] },
  { pattern: /clinic|derm|laser|tone|pigment/i, types: ['dermatology-clinic', 'facial'] },
  { pattern: /mask|serum|toner|cream|skin|skincare|niacinamide|retinol|cica|heartleaf/i, types: ['facial', 'skin-care', 'dermatology-clinic'] },
];

export function inferAnchorServiceTypesFromProduct(product?: Product | null): ServiceType[] {
  const text = [
    product?.title,
    product?.subtitle,
    product?.brand?.name,
    Array.isArray(product?.category_path) ? product?.category_path.join(' ') : '',
    Array.isArray(product?.tags) ? product?.tags.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');

  for (const hint of BEAUTY_SERVICE_HINTS) {
    if (hint.pattern.test(text)) return hint.types;
  }
  return ['facial', 'skin-care'];
}

function sortListingsForAnchor(listings: ServiceListing[]): ServiceListing[] {
  return [...listings].sort((left, right) => {
    const leftConsult = left.requires_consult || left.price_cents == null;
    const rightConsult = right.requires_consult || right.price_cents == null;
    if (leftConsult !== rightConsult) return leftConsult ? 1 : -1;
    return (left.price_cents ?? Number.POSITIVE_INFINITY) - (right.price_cents ?? Number.POSITIVE_INFINITY);
  });
}

export function pickAnchorListing(provider: Provider, anchorProduct?: Product | null): ServiceListing {
  const listings = getProviderListings(provider);
  const anchorTypes = inferAnchorServiceTypesFromProduct(anchorProduct);

  for (const type of anchorTypes) {
    const matches = listings.filter((listing) => listing.service_type === type);
    if (matches.length) return sortListingsForAnchor(matches)[0] as ServiceListing;
  }

  return sortListingsForAnchor(listings)[0] || listings[0];
}
