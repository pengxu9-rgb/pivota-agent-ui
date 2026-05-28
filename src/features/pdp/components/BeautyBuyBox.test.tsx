import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BeautyDesktopBuyBox } from './BeautyDesktopBuyBox';
import { BeautyMobileBuyBar } from './BeautyMobileBuyBar';

const baseProps = {
  unitPrice: 42,
  currency: 'USD',
  quantity: 1,
  onQtyChange: vi.fn(),
  onAddToCart: vi.fn(),
  onBuyNow: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Beauty buy-box CTAs', () => {
  it('keeps the internal desktop buy box unchanged', () => {
    render(<BeautyDesktopBuyBox {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Add to bag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy now · $42' })).toBeInTheDocument();
  });

  it('renders an honest outbound desktop CTA for external retailers', () => {
    render(
      <BeautyDesktopBuyBox
        {...baseProps}
        isExternalPurchase
        externalRetailerLabel="Sephora"
      />,
    );

    const cta = screen.getByRole('button', { name: 'View at Sephora · $42' });
    expect(cta.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to bag' })).toBeNull();
  });

  it('uses a generic retailer fallback on the mobile outbound CTA', () => {
    render(<BeautyMobileBuyBar {...baseProps} isExternalPurchase />);

    expect(screen.getByRole('button', { name: 'View at retailer · $42' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to bag' })).toBeNull();
  });
});
