import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SimilarQuickActionSheet } from '@/features/pdp/sections/SimilarQuickActionSheet';

describe('SimilarQuickActionSheet', () => {
  it('shows option-driven labels instead of placeholder variant titles', () => {
    render(
      <SimilarQuickActionSheet
        open
        onClose={() => {}}
        title="Great Barrier Relief"
        sellerLabel="KraveBeauty"
        selectedVariantId="v_std"
        actionLabel="Open"
        onSelect={() => {}}
        onSubmit={() => {}}
        variants={[
          {
            variant_id: 'v_std',
            title: 'Variant 1',
            options: [{ name: 'size', value: 'Standard - 45 mL' }],
            price: { current: { amount: 28, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 9 },
          },
          {
            variant_id: 'v_jumbo',
            title: 'Variant 2',
            options: [{ name: 'size', value: 'Jumbo - 100 mL' }],
            price: { current: { amount: 40, currency: 'EUR' } },
            availability: { in_stock: true, available_quantity: 9 },
          },
        ]}
      />,
    );

    expect(screen.getByText('Standard - 45 mL')).toBeInTheDocument();
    expect(screen.getByText('Jumbo - 100 mL')).toBeInTheDocument();
    expect(screen.queryByText('Variant 1')).toBeNull();
    expect(screen.queryByText('Variant 2')).toBeNull();
  });
});
