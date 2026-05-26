export type ServiceType =
  | 'facial'
  | 'dermatology-clinic'
  | 'skin-care'
  | 'body-care'
  | 'massage'
  | 'hair-cut'
  | 'hair-color'
  | 'hair-perm'
  | 'hair-treatment'
  | 'scalp-care'
  | 'lashes'
  | 'eyebrow-tattoo'
  | 'makeup'
  | 'bridal-makeup'
  | 'waxing'
  | 'nails';

export type EnglishFriendlySignal = 'explicit' | 'inferred' | 'unknown';
export type BookingStatus = 'requested' | 'confirmed' | 'declined' | 'expired';
export type WalkInAccepted = 'true' | 'false' | 'unknown';
export type AcceptsCard = 'true' | 'false' | 'unknown';
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ServiceListing = {
  id?: string;
  listing_id?: string;
  service_type: ServiceType;
  title: string;
  price_cents: number | null;
  currency: 'KRW';
  duration_minutes: number | null;
  requires_consult: boolean;
  usd_per_won_rate?: number;
};

export type TouristMetadata = {
  nearest_station?: string | null;
  walk_in_accepted: WalkInAccepted;
  accepts_card: AcceptsCard;
  tipping_norm: 'not-expected';
};

export type ProviderHours = Record<DayKey, Array<{ open: string; close: string }>>;

export type Provider = {
  id: string;
  provider_id?: string;
  name: string;
  name_kr?: string;
  display_name?: string;
  address: string;
  address_kr?: string;
  url?: string;
  neighborhood: string;
  english_friendly_signal: EnglishFriendlySignal;
  english_friendly_evidence?: string;
  tourist_metadata: TouristMetadata;
  rating: number | null;
  rating_count: number | null;
  hours?: ProviderHours;
  photos?: string[];
  photo?: string | null;
  matching_listings: ServiceListing[];
  service_listings?: ServiceListing[];
  preview_listings?: ServiceListing[];
  matching_listings_count: number;
  usd_per_won_rate?: number;
  is_real?: boolean;
};

export type ServicesBrowseResponse = {
  scope?: {
    city?: string;
    district?: string;
  };
  results: Provider[];
  pagination?: {
    total?: number;
    offset?: number;
    limit?: number;
    total_pilot_providers?: number;
    has_more?: boolean;
  };
  usd_per_won_rate?: number;
};

export type SlotChoice = {
  date: string;
  time: string;
};

export type BookingContact = {
  email?: string;
  phone?: string;
};

export type BookingRequest = {
  provider_id: string;
  listing_id?: string;
  preferred: SlotChoice;
  alternates?: SlotChoice[];
  contact: BookingContact;
  notes?: string;
};

export type ServiceBooking = {
  booking_id: string;
  status: BookingStatus;
  provider: Provider;
  listing: ServiceListing;
  preferred: SlotChoice;
  alternates?: SlotChoice[];
  contact: BookingContact;
  notes?: string;
  requested_at?: string;
  expires_at?: string;
  confirmed_for?: SlotChoice;
  alternative_providers?: Provider[];
  usd_per_won_rate?: number;
};

export type ServiceCardData = {
  provider: Provider;
  listing: ServiceListing;
  usdRate?: number;
};

export type ServicesBrowseQuery = {
  q?: string;
  english_friendly?: boolean;
  priced_only?: boolean;
  service_type?: ServiceType[];
  max_price_won?: number;
  walk_ins?: boolean;
  offset?: number;
  limit?: number;
};

export function getProviderId(provider: Pick<Provider, 'id' | 'provider_id'>): string {
  return String(provider.provider_id || provider.id || '').trim();
}

export function getProviderListings(provider: Pick<Provider, 'matching_listings' | 'service_listings'>): ServiceListing[] {
  return provider.service_listings?.length ? provider.service_listings : provider.matching_listings || [];
}
