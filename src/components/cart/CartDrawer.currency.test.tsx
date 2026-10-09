/* eslint-disable @next/next/no-img-element */
// THE BAG RENDERS EACH LINE IN ITS OWN CURRENCY AND NEVER SUMS ACROSS CURRENCIES.
// Before 2026-10-09 every price was `$${x.toFixed(2)}` and the subtotal added amounts
// regardless of currency, so a JP-located buyer's ¥3,500 line read "$3500.00".
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CartDrawer from './CartDrawer';
import { useCartStore } from '@/store/cartStore';

const checkout = vi.hoisted(() => ({ resolve: vi.fn(), toastError: vi.fn() }));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) => {
    const { fill: _fill, unoptimized: _unoptimized, alt, ...rest } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
      const { initial: _i, animate: _a, exit: _e, transition: _t, ...domProps } = props as Record<string, unknown>;
      return <div {...(domProps as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
    },
  },
}));
vi.mock('@/lib/auroraEmbed', () => ({ isAuroraEmbedMode: () => false, postRequestCloseToParent: vi.fn() }));
vi.mock('@/lib/ucpCheckout', () => ({ resolveHostedCheckoutUrl: (...args: unknown[]) => checkout.resolve(...args) }));
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => checkout.toastError(...args), success: vi.fn(), message: vi.fn() } }));

const line = (id: string, price: number, currency: string | undefined, quantity = 1) => ({
  id, product_id: id, variant_id: `${id}:v`, title: `Item ${id}`, price, currency, quantity, imageUrl: '/placeholder.svg', merchant_id: 'm1',
});

describe('CartDrawer currencies', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCartStore.setState({ items: [], isOpen: true });
    checkout.resolve.mockReset();
    checkout.toastError.mockReset();
    checkout.resolve.mockResolvedValue({ status: 'blocked', message: 'not in this test' });
  });
  afterEach(() => cleanup());

  it('a JPY line is ¥3,500, not "$3500.00", and the subtotal is in JPY', () => {
    useCartStore.getState().addItem(line('a', 3500, 'JPY'));
    render(<CartDrawer />);
    expect(document.body.textContent).not.toContain('$3500');
    expect(screen.getAllByText('¥3,500').length).toBe(3); // the line, the subtotal, the estimated total
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeEnabled();
  });

  it('a USD bag still reads in dollars, summed over quantities', () => {
    useCartStore.getState().addItem(line('a', 23, 'USD', 2));
    useCartStore.getState().addItem(line('b', 4.5, 'usd'));
    render(<CartDrawer />);
    expect(screen.getAllByText('$50.50').length).toBeGreaterThanOrEqual(2);
  });

  it('a mixed-currency bag has NO subtotal, says why, and refuses checkout', async () => {
    useCartStore.getState().addItem(line('a', 23, 'USD'));
    useCartStore.getState().addItem(line('b', 3500, 'JPY'));
    render(<CartDrawer />);
    expect(screen.getAllByText('$23').length).toBe(1); // the line only: no subtotal in any currency
    expect(screen.getAllByText('¥3,500').length).toBe(1);
    expect(screen.getAllByText('Mixed currencies').length).toBe(2);
    expect(screen.getByRole('alert').textContent).toContain('USD and JPY');
    expect(document.body.textContent).not.toMatch(/\$3,?523|¥3,523/);
    // THE REFUSAL IS THE HANDLER'S, not a disabled attribute React would swallow the click on:
    // the click reaches it, it says why, and no checkout URL is ever resolved.
    const button = screen.getByRole('button', { name: 'Checkout' });
    expect(button).toHaveAttribute('aria-describedby', 'cart-mixed-currencies');
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkout.resolve).not.toHaveBeenCalled();
    expect(checkout.toastError).toHaveBeenCalledTimes(1);
    expect(String(checkout.toastError.mock.calls[0][0])).toContain('USD and JPY');
  });

  it('removing the other market\'s line restores the subtotal and checkout', () => {
    useCartStore.getState().addItem(line('a', 23, 'USD'));
    useCartStore.getState().addItem(line('b', 3500, 'JPY'));
    useCartStore.getState().removeItem('b');
    render(<CartDrawer />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText('$23').length).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    expect(checkout.resolve).toHaveBeenCalledTimes(1);
    expect(checkout.toastError).not.toHaveBeenCalled();
  });
});
