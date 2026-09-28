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
  ] as const)('%s: secondary store button then primary Reap; each calls its own handler', (_l, Bar) => {
    const onBuyNow = vi.fn();
    const onOpen = vi.fn();
    render(<Bar {...base} onBuyNow={onBuyNow} reapCheckout={{ onOpen }} />);
    const secondary = screen.getByTestId('buybar-store-secondary');
    const primary = screen.getByTestId('buybar-reap-primary');
    expect(secondary.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primary.textContent).toMatch(/Buy with Reap/);
    expect(primary.textContent).toContain('$13.99');
    fireEvent.click(primary);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onBuyNow).not.toHaveBeenCalled();
    fireEvent.click(secondary);
    expect(onBuyNow).toHaveBeenCalledTimes(1);
  });
});
