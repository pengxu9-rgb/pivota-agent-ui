import type { Provider, ProviderHours, ServiceListing } from '@/features/services/lib/types';

const STANDARD_HOURS: ProviderHours = {
  mon: [{ open: '11:00', close: '21:00' }],
  tue: [{ open: '11:00', close: '21:00' }],
  wed: [{ open: '11:00', close: '21:00' }],
  thu: [{ open: '11:00', close: '21:00' }],
  fri: [{ open: '11:00', close: '21:00' }],
  sat: [{ open: '11:00', close: '20:00' }],
  sun: [],
};

const SPLIT_HOURS: ProviderHours = {
  mon: [{ open: '10:00', close: '13:00' }, { open: '14:30', close: '20:00' }],
  tue: [{ open: '10:00', close: '13:00' }, { open: '14:30', close: '20:00' }],
  wed: [{ open: '10:00', close: '13:00' }, { open: '14:30', close: '20:00' }],
  thu: [{ open: '10:00', close: '13:00' }, { open: '14:30', close: '20:00' }],
  fri: [{ open: '10:00', close: '13:00' }, { open: '14:30', close: '20:00' }],
  sat: [{ open: '10:00', close: '17:00' }],
  sun: [],
};

const CLINIC_HOURS: ProviderHours = {
  mon: [{ open: '09:30', close: '18:30' }],
  tue: [{ open: '09:30', close: '18:30' }],
  wed: [{ open: '09:30', close: '20:00' }],
  thu: [{ open: '09:30', close: '18:30' }],
  fri: [{ open: '09:30', close: '18:30' }],
  sat: [{ open: '09:30', close: '15:00' }],
  sun: [],
};

function listing(
  id: string,
  data: Omit<ServiceListing, 'id' | 'listing_id' | 'currency'>,
): ServiceListing {
  return { id, listing_id: id, currency: 'KRW', ...data };
}

function provider(data: Omit<Provider, 'display_name' | 'is_real' | 'matching_listings_count'>): Provider {
  const listings = data.service_listings?.length ? data.service_listings : data.matching_listings;
  return {
    ...data,
    display_name: data.name,
    matching_listings_count: listings.length,
    is_real: false,
  };
}

export const MOCK_PROVIDERS: Provider[] = [
  provider({
    id: 'aya-seoul',
    name: 'Aya Seoul',
    name_kr: '아야 서울',
    neighborhood: 'Cheongdam',
    address: '15 Seolleung-ro 148-gil, Gangnam-gu',
    address_kr: '서울 강남구 선릉로148길 15',
    english_friendly_signal: 'explicit',
    english_friendly_evidence: 'Official English pages, English-speaking staff on staff page',
    photo: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=720&q=70&auto=format&fit=crop',
    photos: [
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=900&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=900&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1522335789203-aaa2a9b5d7d6?w=900&q=72&auto=format&fit=crop',
    ],
    tourist_metadata: {
      nearest_station: 'Apgujeong Rodeo Stn.',
      walk_in_accepted: 'unknown',
      accepts_card: 'true',
      tipping_norm: 'not-expected',
    },
    rating: null,
    rating_count: null,
    hours: STANDARD_HOURS,
    matching_listings: [
      listing('aya-signature-facial', {
        service_type: 'facial',
        title: 'Aya Signature Facial',
        price_cents: 198000,
        duration_minutes: 110,
        requires_consult: false,
      }),
      listing('aya-express-hydration', {
        service_type: 'facial',
        title: 'Express Hydration',
        price_cents: 128000,
        duration_minutes: 60,
        requires_consult: false,
      }),
      listing('aya-tone-evening-consult', {
        service_type: 'dermatology-clinic',
        title: 'Tone-evening consult',
        price_cents: null,
        duration_minutes: 30,
        requires_consult: true,
      }),
    ],
  }),
  provider({
    id: 'cha-park',
    name: 'Cha & Park Aesthetic',
    name_kr: '차앤박',
    neighborhood: 'Apgujeong',
    address: '634 Sinsa-dong, Gangnam-gu',
    address_kr: '서울 강남구 신사동 634',
    english_friendly_signal: 'explicit',
    english_friendly_evidence: 'English-language site; English-speaking dermatologists listed',
    photo: null,
    photos: [],
    tourist_metadata: {
      nearest_station: 'Apgujeong Stn.',
      walk_in_accepted: 'false',
      accepts_card: 'true',
      tipping_norm: 'not-expected',
    },
    rating: null,
    rating_count: null,
    hours: CLINIC_HOURS,
    matching_listings: [
      listing('cha-glass-skin-glow', {
        service_type: 'facial',
        title: 'Glass Skin Glow Facial',
        price_cents: 135000,
        duration_minutes: 90,
        requires_consult: false,
      }),
      listing('cha-toner-pad-infusion', {
        service_type: 'dermatology-clinic',
        title: 'Toner-pad infusion',
        price_cents: 88000,
        duration_minutes: 45,
        requires_consult: false,
      }),
    ],
  }),
  provider({
    id: 'cnp-clinic',
    name: 'CNP Skin Clinic',
    name_kr: '씨앤피',
    neighborhood: 'Apgujeong',
    address: '38 Apgujeong-ro 79-gil, Gangnam-gu',
    address_kr: '서울 강남구 압구정로79길 38',
    english_friendly_signal: 'explicit',
    english_friendly_evidence: 'English intake forms, multi-lingual reception',
    photo: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=720&q=70&auto=format&fit=crop',
    photos: [
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=900&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1620916297893-c92b35e8c3f6?w=900&q=72&auto=format&fit=crop',
    ],
    tourist_metadata: {
      nearest_station: 'Apgujeong Stn.',
      walk_in_accepted: 'false',
      accepts_card: 'true',
      tipping_norm: 'not-expected',
    },
    rating: null,
    rating_count: null,
    hours: CLINIC_HOURS,
    matching_listings: [
      listing('cnp-hydrafacial-first-visit', {
        service_type: 'dermatology-clinic',
        title: 'HydraFacial · first visit',
        price_cents: null,
        duration_minutes: 60,
        requires_consult: true,
      }),
      listing('cnp-aqua-peel-led', {
        service_type: 'facial',
        title: 'Aqua-peel + LED',
        price_cents: 185000,
        duration_minutes: 75,
        requires_consult: false,
      }),
    ],
  }),
  provider({
    id: 'mireu',
    name: 'Mireu Dermatology',
    name_kr: '미루',
    neighborhood: 'Sinsa',
    address: '28 Garosu-gil, Gangnam-gu',
    address_kr: '서울 강남구 가로수길 28',
    english_friendly_signal: 'inferred',
    english_friendly_evidence: 'Korean-only site; English mentioned in Naver Map reviews',
    photo: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=720&q=70&auto=format&fit=crop',
    photos: [
      'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=900&q=72&auto=format&fit=crop',
    ],
    tourist_metadata: {
      nearest_station: 'Sinsa Stn.',
      walk_in_accepted: 'false',
      accepts_card: 'true',
      tipping_norm: 'not-expected',
    },
    rating: null,
    rating_count: null,
    hours: SPLIT_HOURS,
    matching_listings: [
      listing('mireu-glow-drip', {
        service_type: 'facial',
        title: 'Mireu Glow Drip',
        price_cents: 280000,
        duration_minutes: 60,
        requires_consult: false,
      }),
      listing('mireu-pigmentation-consult', {
        service_type: 'dermatology-clinic',
        title: 'Pigmentation consult',
        price_cents: null,
        duration_minutes: 30,
        requires_consult: true,
      }),
    ],
  }),
  provider({
    id: 'glow-lab',
    name: 'Glow Lab Apgujeong',
    name_kr: '글로우랩',
    neighborhood: 'Apgujeong',
    address: '12 Eonju-ro 168-gil, Gangnam-gu',
    address_kr: '서울 강남구 언주로168길 12',
    english_friendly_signal: 'explicit',
    english_friendly_evidence: 'English booking form on official site',
    photo: null,
    photos: [],
    tourist_metadata: {
      nearest_station: 'Apgujeong Rodeo Stn.',
      walk_in_accepted: 'true',
      accepts_card: 'true',
      tipping_norm: 'not-expected',
    },
    rating: null,
    rating_count: null,
    hours: STANDARD_HOURS,
    matching_listings: [
      listing('glow-korean-express-facial', {
        service_type: 'facial',
        title: 'Korean Express Facial',
        price_cents: 89000,
        duration_minutes: 50,
        requires_consult: false,
      }),
      listing('glow-lash-lift-tint', {
        service_type: 'lashes',
        title: 'Lash Lift & Tint',
        price_cents: 75000,
        duration_minutes: 75,
        requires_consult: false,
      }),
      listing('glow-brow-touch-up', {
        service_type: 'eyebrow-tattoo',
        title: 'Brow Touch-up',
        price_cents: 120000,
        duration_minutes: 60,
        requires_consult: false,
      }),
    ],
  }),
  provider({
    id: 'hatherly',
    name: 'Hatherly Skin Studio',
    name_kr: '해덜리',
    neighborhood: 'Gangnam',
    address: '8 Teheran-ro 4-gil, Gangnam-gu',
    address_kr: '서울 강남구 테헤란로4길 8',
    english_friendly_signal: 'explicit',
    english_friendly_evidence: 'Founder bio in English; international clientele cited',
    photo: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=720&q=70&auto=format&fit=crop',
    photos: [
      'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=900&q=72&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=900&q=72&auto=format&fit=crop',
    ],
    tourist_metadata: {
      nearest_station: null,
      walk_in_accepted: 'unknown',
      accepts_card: 'true',
      tipping_norm: 'not-expected',
    },
    rating: null,
    rating_count: null,
    hours: STANDARD_HOURS,
    matching_listings: [
      listing('hatherly-cica-repair-facial', {
        service_type: 'facial',
        title: 'Cica Repair Facial',
        price_cents: 168000,
        duration_minutes: 80,
        requires_consult: false,
      }),
      listing('hatherly-barrier-calm-express', {
        service_type: 'skin-care',
        title: 'Barrier Calm Express',
        price_cents: 98000,
        duration_minutes: 50,
        requires_consult: false,
      }),
      listing('hatherly-volume-lash-set', {
        service_type: 'lashes',
        title: 'Volume Lash Set',
        price_cents: 135000,
        duration_minutes: 120,
        requires_consult: false,
      }),
    ],
  }),
];
