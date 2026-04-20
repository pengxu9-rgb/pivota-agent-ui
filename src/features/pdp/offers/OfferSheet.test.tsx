import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfferSheet } from './OfferSheet';

vi.mock('@/features/pdp/hooks/useIsDesktop', () => ({
  useIsDesktop: () => true,
}));

describe('OfferSheet', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses real store fields instead of brand fields for internal marketplace offers', async () => {
    render(
      <OfferSheet
        open
        offers={[
          {
            offer_id: 'of:internal_checkout:merch_efbc46b4619cfbdf:10008793153864',
            product_id: '10008793153864',
            merchant_id: 'merch_efbc46b4619cfbdf',
            store_name: 'Pivota Market',
            seller_of_record: 'merchant',
            vendor: 'KraveBeauty',
            price: { amount: 28, currency: 'EUR' },
          } as any,
        ]}
        selectedOfferId={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(await screen.findByText('Pivota Market')).toBeInTheDocument();
    expect(screen.queryByText('KraveBeauty')).not.toBeInTheDocument();
    expect(screen.queryByText('merchant')).not.toBeInTheDocument();
    expect(screen.queryByText('merch_efbc46b4619cfbdf')).not.toBeInTheDocument();
  });

  it('renders variant-aware seller prices for the selected size', async () => {
    render(
      <OfferSheet
        open
        offers={[
          {
            offer_id: 'offer_internal_pivota_market',
            product_id: '10008793153864',
            merchant_id: 'merch_efbc46b4619cfbdf',
            store_name: 'Pivota Market',
            price: { amount: 28, currency: 'EUR' },
            variants: [
              {
                variant_id: 'SHOP_STD',
                title: 'Standard - 45 mL',
                options: [{ name: 'size', value: 'Standard - 45 mL' }],
                price: { current: { amount: 28, currency: 'EUR' } },
              },
              {
                variant_id: 'SHOP_JUMBO',
                title: 'Jumbo - 100 mL',
                options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
                price: { current: { amount: 40, currency: 'EUR' } },
              },
            ],
          } as any,
          {
            offer_id: 'offer_external_seed_default',
            product_id: 'ext_670fd3f47ecd319d143f8c65',
            merchant_id: 'external_seed',
            merchant_name: 'KraveBeauty',
            price: { amount: 28, currency: 'EUR' },
            variants: [
              {
                variant_id: 'EXT_STD',
                title: 'Standard - 45 mL',
                options: [{ name: 'size', value: 'Standard - 45 mL' }],
                price: { current: { amount: 28, currency: 'EUR' } },
              },
              {
                variant_id: 'EXT_JUMBO',
                title: 'Jumbo - 100 mL',
                options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
                price: { current: { amount: 50, currency: 'EUR' } },
              },
            ],
          } as any,
        ]}
        selectedOfferId="offer_internal_pivota_market"
        defaultOfferId="offer_internal_pivota_market"
        bestPriceOfferId="offer_internal_pivota_market"
        selectedVariant={{
          variant_id: 'EXT_JUMBO',
          title: 'Jumbo - 100 mL',
          options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
          price: { current: { amount: 50, currency: 'EUR' } },
        }}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(await screen.findByText('Item: €40.00')).toBeInTheDocument();
    expect(screen.getByText('Item: €50.00')).toBeInTheDocument();
  });

  it('does not leak selected product savings into external seed offer rows', async () => {
    render(
      <OfferSheet
        open
        offers={[
          {
            offer_id: 'offer_internal_pivota_market',
            product_id: '10064558096681',
            merchant_id: 'merch_efbc46b4619cfbdf',
            store_name: 'Pivota Market',
            price: { amount: 28, currency: 'USD' },
            store_discount_evidence: {
              offers: [
                {
                  store_discount_id: 'store_a',
                  discount_type: 'basic',
                  status: 'available',
                  display: { badge: 'Pivota store code' },
                },
              ],
            },
          } as any,
          {
            offer_id: 'offer_external_seed_default',
            product_id: 'ext_670fd3f47ecd319d143f8c65',
            merchant_id: 'external_seed',
            merchant_name: 'KraveBeauty',
            price: { amount: 28, currency: 'USD' },
          } as any,
        ]}
        selectedOfferId="offer_external_seed_default"
        defaultOfferId="offer_internal_pivota_market"
        bestPriceOfferId="offer_internal_pivota_market"
        selectedVariant={{
          variant_id: 'SHOP_STD',
          title: 'Standard - 45 mL',
          price: { current: { amount: 28, currency: 'USD' } },
          store_discount_evidence: {
            offers: [
              {
                store_discount_id: 'variant_store_a',
                discount_type: 'basic',
                status: 'available',
                display: { badge: 'Variant store code' },
              },
            ],
          },
        }}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    const internalRow = (await screen.findByText('Pivota Market')).closest('button');
    const externalRow = screen.getByText('KraveBeauty').closest('button');
    expect(internalRow).not.toBeNull();
    expect(externalRow).not.toBeNull();
    expect(within(internalRow as HTMLElement).getByText('Pivota store code')).toBeInTheDocument();
    expect(within(externalRow as HTMLElement).queryByText('Pivota store code')).not.toBeInTheDocument();
    expect(within(externalRow as HTMLElement).queryByText('Variant store code')).not.toBeInTheDocument();
  });
});
