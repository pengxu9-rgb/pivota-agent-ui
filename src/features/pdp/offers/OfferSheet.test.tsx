import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferSheet } from './OfferSheet';

vi.mock('@/features/pdp/hooks/useIsDesktop', () => ({
  useIsDesktop: () => true,
}));

describe('OfferSheet', () => {
  it('prefers seller display fields over internal merchant ids', async () => {
    render(
      <OfferSheet
        open
        offers={[
          {
            offer_id: 'of:internal_checkout:merch_efbc46b4619cfbdf:10008793153864',
            product_id: '10008793153864',
            merchant_id: 'merch_efbc46b4619cfbdf',
            vendor: 'KraveBeauty',
            price: { amount: 28, currency: 'EUR' },
          } as any,
        ]}
        selectedOfferId={null}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(await screen.findByText('KraveBeauty')).toBeInTheDocument();
    expect(screen.queryByText('merch_efbc46b4619cfbdf')).not.toBeInTheDocument();
  });
});
