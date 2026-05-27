'use client';

import { useReducer, useState } from 'react';
import { BeautyYouMayAlsoLike, type BeautySimilarItem } from '@/features/pdp/components/BeautyYouMayAlsoLike';
import { AddressCard } from '@/features/services/components/AddressCard';
import { BookingItineraryCard } from '@/features/services/components/BookingItineraryCard';
import { BookingSheet } from '@/features/services/components/BookingSheet';
import { BookingStatusPill } from '@/features/services/components/BookingStatusPill';
import { BookingStepContact } from '@/features/services/components/BookingStepContact';
import { BookingStepNotes } from '@/features/services/components/BookingStepNotes';
import { BookingStepReview } from '@/features/services/components/BookingStepReview';
import { BookingStepSlots } from '@/features/services/components/BookingStepSlots';
import { BrowseProviderCard } from '@/features/services/components/BrowseProviderCard';
import { EnglishBadge } from '@/features/services/components/EnglishBadge';
import { HoursAccordion } from '@/features/services/components/HoursAccordion';
import { IdentityBlock } from '@/features/services/components/IdentityBlock';
import { PilotDisclosure } from '@/features/services/components/PilotDisclosure';
import { ProviderHero } from '@/features/services/components/ProviderHero';
import { ServiceMenuGroup } from '@/features/services/components/ServiceMenuGroup';
import { MOCK_ANCHOR_PRODUCTS } from '@/features/services/fixtures/mock-anchor-products';
import { MOCK_PROVIDERS } from '@/features/services/fixtures/mock-providers';
import { pickAnchorListing } from '@/features/services/lib/pick-anchor-listing';
import { getProviderListings, type BookingStatus, type ServiceBooking, type ServiceCardData, type ServiceListing, type ServiceType } from '@/features/services/lib/types';
import type { BookingDraftAction, BookingDraftState } from '@/features/services/lib/use-booking-draft';

const PRODUCT_IMAGES = [
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=720&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=720&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1522335789203-aaa2a9b5d7d6?w=720&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=720&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=720&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=720&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=720&q=70&auto=format&fit=crop',
];

const similarItems: BeautySimilarItem[] = PRODUCT_IMAGES.map((image, index) => {
  const product = MOCK_ANCHOR_PRODUCTS[index % MOCK_ANCHOR_PRODUCTS.length];
  return {
    id: `${product.product_id}-${index}`,
    title: product.title,
    brand: product.brand?.name || null,
    image,
    priceLabel: index % 2 ? '$28' : '$34',
    badge: index % 2 ? 'Trending' : null,
    rating: index % 2 ? null : 4.7,
    href: `/products/${product.product_id}`,
  };
});

const anchor = MOCK_ANCHOR_PRODUCTS[0];
const serviceCards: ServiceCardData[] = MOCK_PROVIDERS.slice(0, 3).map((provider) => ({
  provider,
  listing: pickAnchorListing(provider, anchor),
}));

const provider = MOCK_PROVIDERS[0];
const noPhotoProvider = MOCK_PROVIDERS[1];
const listing = getProviderListings(provider)[0];
const consultListing = getProviderListings(MOCK_PROVIDERS[2])[0];

function groupProviderListings() {
  const map = new Map<ServiceType, ServiceListing[]>();
  for (const item of getProviderListings(provider)) {
    const group = map.get(item.service_type) || [];
    group.push(item);
    map.set(item.service_type, group);
  }
  return Array.from(map.entries());
}

const initialDraft: BookingDraftState = {
  provider_id: provider.id,
  listing_id: listing.listing_id || listing.id,
  preferred: { date: '2026-11-12', time: '13:30' },
  alternates: [{ date: '2026-11-13', time: '15:00' }],
  contact: { email: 'traveler@example.com', phone: '+1 555 0100' },
  notes: 'Sensitive skin; interested in a gentle glow facial before photos.',
};

function draftReducer(state: BookingDraftState, action: BookingDraftAction): BookingDraftState {
  if (action.type === 'reset') return action.state;
  if (action.type === 'patch') return { ...state, ...action.patch };
  if (action.type === 'set_preferred') return { ...state, preferred: action.preferred };
  if (action.type === 'set_alternates') return { ...state, alternates: action.alternates };
  if (action.type === 'set_contact') return { ...state, contact: action.contact };
  if (action.type === 'set_notes') return { ...state, notes: action.notes };
  return state;
}

function CanvasSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--pv-radius-lg)] border border-[var(--pv-border)] bg-white p-4 shadow-[var(--pv-shadow-sm)]">
      <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--pv-ink-45)]">{title}</h2>
      {children}
    </section>
  );
}

function booking(status: BookingStatus): ServiceBooking {
  return {
    booking_id: status === 'expired' ? 'BK-EXPIRED' : 'BK-2D8FQ4',
    status,
    provider,
    listing,
    preferred: initialDraft.preferred,
    alternates: initialDraft.alternates,
    contact: initialDraft.contact,
    notes: initialDraft.notes,
    alternative_providers: MOCK_PROVIDERS.slice(1, 3),
  };
}

export default function ServicesCanvas() {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [sheetOpen, setSheetOpen] = useState(false);
  const requestedBooking = booking('requested');
  const expiredBooking = booking('expired');

  return (
    <div className="pv-pdp min-h-screen bg-[var(--pv-paper)] px-4 py-6 text-[var(--pv-ink)]">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pv-ink-45)]">Dev canvas</div>
          <h1 className="mt-1 font-serif text-[34px] font-medium text-[var(--pv-ink)]">Pivota Beauty Services · Seoul</h1>
        </div>

        <CanvasSection title="Surface 1 · PDP sprinkled feed">
          <div className="max-w-[900px]">
            <BeautyYouMayAlsoLike items={similarItems} services={serviceCards} />
          </div>
        </CanvasSection>

        <CanvasSection title="Surface 2a · Browse results">
          <div className="mb-4 rounded-[var(--pv-radius-lg)] bg-[var(--pv-tip-bg)] px-3 py-3 text-[11.5px] font-medium text-[var(--pv-tip-fg)]">
            Pilot · Seoul Gangnam-gu. Requests are routed via KakaoTalk; providers typically confirm within 24h. No deposit charged.
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {MOCK_PROVIDERS.map((item) => (
              <BrowseProviderCard key={item.id} provider={item} />
            ))}
          </div>
        </CanvasSection>

        <CanvasSection title="Surface 2b · Provider detail">
          <div className="grid gap-5 md:grid-cols-[600px_1fr]">
            <div className="space-y-4">
              <ProviderHero photos={provider.photos || []} providerName={provider.name} serviceType={listing.service_type} className="h-[360px]" />
              <ProviderHero photos={noPhotoProvider.photos || []} providerName={noPhotoProvider.name} serviceType={getProviderListings(noPhotoProvider)[0].service_type} className="h-[220px]" />
              <AddressCard provider={provider} />
              <HoursAccordion hours={provider.hours} />
            </div>
            <div className="space-y-4">
              <IdentityBlock provider={provider} />
              <PilotDisclosure />
              <div className="space-y-3">
                {groupProviderListings().map(([serviceType, listings], index) => (
                  <ServiceMenuGroup
                    key={serviceType}
                    serviceType={serviceType}
                    listings={listings}
                    defaultOpen={index === 0}
                    onRequest={() => setSheetOpen(true)}
                  />
                ))}
              </div>
            </div>
          </div>
        </CanvasSection>

        <CanvasSection title="Surface 2c · Booking steps">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--pv-radius-lg)] bg-[var(--pv-paper)] p-4"><BookingStepSlots draft={draft} dispatch={dispatch} /></div>
            <div className="rounded-[var(--pv-radius-lg)] bg-[var(--pv-paper)] p-4"><BookingStepContact draft={draft} dispatch={dispatch} partnerEmail="traveler@example.com" partnerName="Airbnb" /></div>
            <div className="rounded-[var(--pv-radius-lg)] bg-[var(--pv-paper)] p-4"><BookingStepNotes draft={draft} dispatch={dispatch} /></div>
            <div className="rounded-[var(--pv-radius-lg)] bg-[var(--pv-paper)] p-4"><BookingStepReview draft={draft} provider={provider} listing={consultListing || listing} /></div>
          </div>
          <button type="button" onClick={() => setSheetOpen(true)} className="mt-4 rounded-full bg-[var(--pv-ink)] px-4 py-2 text-[12px] font-semibold text-white">
            Open booking sheet
          </button>
        </CanvasSection>

        <CanvasSection title="Confirmation + expired">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <BookingStatusPill status="requested" />
              <BookingItineraryCard provider={requestedBooking.provider} listing={requestedBooking.listing} preferred={requestedBooking.preferred} status="requested" />
            </div>
            <div className="space-y-3">
              <BookingStatusPill status="expired" />
              <BookingItineraryCard provider={expiredBooking.provider} listing={expiredBooking.listing} preferred={expiredBooking.preferred} status="expired" dim />
            </div>
          </div>
        </CanvasSection>

        <CanvasSection title="Component callouts">
          <div className="flex flex-wrap items-center gap-3">
            <EnglishBadge state="explicit" />
            <EnglishBadge state="inferred" />
            <BookingStatusPill status="requested" />
            <BookingStatusPill status="confirmed" />
            <BookingStatusPill status="declined" />
            <BookingStatusPill status="expired" />
          </div>
        </CanvasSection>
      </div>

      <BookingSheet open={sheetOpen} onOpenChange={setSheetOpen} provider={provider} listing={listing} />
    </div>
  );
}
