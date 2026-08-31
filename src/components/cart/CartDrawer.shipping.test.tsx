/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CartDrawer from './CartDrawer';

vi.mock('next/image', () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      unoptimized?: boolean;
    },
  ) => {
    const { fill: _fill, unoptimized: _unoptimized, alt, ...rest } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
      const {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        ...domProps
      } = props as React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
      return <div {...domProps}>{children}</div>;
    },
  },
}));

vi.mock('@/lib/auroraEmbed', () => ({
  isAuroraEmbedMode: () => false,
  postRequestCloseToParent: vi.fn(),
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: () => ({
    items: [
      {
        id: 'merch_1:variant_1',
        product_id: 'product_1',
        variant_id: 'variant_1',
        title: 'Knight Unicorn Satin Blush',
        price: 23,
        currency: 'USD',
        quantity: 1,
        imageUrl: '/placeholder.svg',
        merchant_id: 'merch_1',
      },
    ],
    isOpen: true,
    close: vi.fn(),
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    getTotal: () => 23,
    clearCart: vi.fn(),
  }),
}));

describe('CartDrawer shipping disclosure', () => {
  afterEach(() => cleanup());

  it('does not promise free shipping before the merchant checkout quote exists', () => {
    render(<CartDrawer />);

    expect(screen.getByText('Calculated at checkout')).toBeInTheDocument();
    expect(screen.getByText('Estimated total')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Final shipping is calculated by the merchant after you enter your delivery address.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('FREE')).not.toBeInTheDocument();
  });
});
