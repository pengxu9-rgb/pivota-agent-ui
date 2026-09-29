import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeautyMobileBuyBar } from './BeautyMobileBuyBar';
import { BeautyDesktopBuyBox } from './BeautyDesktopBuyBox';

afterEach(() => cleanup());

const base = {
  unitPrice: 13.99,
  currency: 'USD',
  quantity: 1,
  onQtyChange: () => {},
  onAddToCart: () => {},
  onBuyNow: () => {},
  isExternalPurchase: true,
  externalRetailerLabel: 'Judydoll',
};

describe('buy bar without Reap is byte-identical to main', () => {
  // The snapshots were recorded from main's components BEFORE the Reap change touched them.
  it.each([
    ['mobile, links-out', BeautyMobileBuyBar, true],
    ['mobile, native', BeautyMobileBuyBar, false],
    ['desktop, links-out', BeautyDesktopBuyBox, true],
    ['desktop, native', BeautyDesktopBuyBox, false],
  ] as const)('%s', (_label, Bar, external) => {
    const { container } = render(<Bar {...base} isExternalPurchase={external} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('buy bar with Reap', () => {
  it.each([
    ['mobile', BeautyMobileBuyBar],
    ['desktop', BeautyDesktopBuyBox],
  ] as const)('%s: reapCheckout={null} renders the same bytes as no prop', (_l, Bar) => {
    const a = render(<Bar {...base} />).container.innerHTML;
    cleanup();
    const b = render(<Bar {...base} reapCheckout={null} />).container.innerHTML;
    expect(b).toBe(a);
  });

  it.each([
    ['mobile', BeautyMobileBuyBar],
    ['desktop', BeautyDesktopBuyBox],
  ] as const)('%s: a native (not links-out) product never shows Reap, even when handed a CTA', (_l, Bar) => {
    const a = render(<Bar {...base} isExternalPurchase={false} />).container.innerHTML;
    cleanup();
    const b = render(<Bar {...base} isExternalPurchase={false} reapCheckout={{ onOpen: () => {} }} />).container.innerHTML;
    expect(b).toBe(a);
  });

  it.each([
    ['mobile', BeautyMobileBuyBar],
    ['desktop', BeautyDesktopBuyBox],
  ] as const)('%s: secondary store button then primary "Checkout with Reap"; each calls its own handler; quantity passed', (_l, Bar) => {
    const onBuyNow = vi.fn();
    const onOpen = vi.fn();
    render(<Bar {...base} quantity={3} onBuyNow={onBuyNow} reapCheckout={{ onOpen }} />);
    const secondary = screen.getByTestId('buybar-store-secondary');
    const primary = screen.getByTestId('buybar-reap-primary');
    expect(secondary.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primary.textContent?.trim()).toBe('Checkout with Reap');
    fireEvent.click(primary);
    expect(onOpen).toHaveBeenCalledWith(3);
    expect(onBuyNow).not.toHaveBeenCalled();
    fireEvent.click(secondary);
    expect(onBuyNow).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['mobile', BeautyMobileBuyBar],
    ['desktop', BeautyDesktopBuyBox],
  ] as const)('%s: on the Reap path the bar NEVER renders a price or a computed total (text or aria)', (_l, Bar) => {
    // unit 13.99 x 3 + shipping 4.5 = 46.47: neither the unit price nor any total may appear.
    const { container } = render(
      <Bar {...base} quantity={3} shippingCost={4.5} reapCheckout={{ onOpen: () => {} }} />,
    );
    const everything = [
      container.textContent || '',
      ...Array.from(container.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label') || ''),
    ].join(' | ');
    expect(everything).not.toMatch(/\$|\d+\.\d{2}|46|13\.99|USD/);
  });
});
