import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeautyYouMayAlsoLike, type BeautySimilarItem } from './BeautyYouMayAlsoLike';

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

const item: BeautySimilarItem = {
  id: 'sig_40c0347ee0c6d9f612f6ec6f',
  merchant_id: 'external_seed',
  href: '/products/sig_40c0347ee0c6d9f612f6ec6f?return=%2F',
  title: 'Scalp Retreat Nourishing Scalp Serum',
  image: 'https://example.com/scalp.jpg',
  priceLabel: '$46.00',
  highlight: 'A face serum from Nourwish for skincare routines.',
};

const aliasOnlyItem: BeautySimilarItem = {
  ...item,
  id: 'ext_40c0347ee0c6d9f612f6ec6f',
  href: '/products/ext_40c0347ee0c6d9f612f6ec6f?return=%2F',
};

describe('BeautyYouMayAlsoLike', () => {
  it('renders similar products as real links covering the product content', () => {
    const onItemClick = vi.fn();

    render(<BeautyYouMayAlsoLike items={[item]} onItemClick={onItemClick} />);

    const link = screen.getByRole('link', { name: item.title });
    expect(link).toHaveAttribute('href', item.href);
    expect(screen.getByText(item.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy/i })).toBeNull();

    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(onItemClick).toHaveBeenCalledWith(item, 0);
  });

  it('keeps the buy action separate from card navigation when provided', () => {
    const onItemClick = vi.fn();
    const onBuy = vi.fn();

    render(
      <BeautyYouMayAlsoLike
        items={[item]}
        onItemClick={onItemClick}
        onBuy={onBuy}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /buy/i }));
    expect(onBuy).toHaveBeenCalledWith(item, 0);
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it('does not render alias-only ext PDP hrefs as links', () => {
    const onItemClick = vi.fn();

    render(<BeautyYouMayAlsoLike items={[aliasOnlyItem]} onItemClick={onItemClick} />);

    expect(screen.queryByRole('link', { name: aliasOnlyItem.title })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: aliasOnlyItem.title }));
    expect(onItemClick).toHaveBeenCalledWith(aliasOnlyItem, 0);
  });
});
