import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./ProductsBrowseClient', () => ({
  default: () => <div>Browse client</div>,
}));

vi.mock('./[id]/pdpSeo', () => ({
  getProductEntitySitemapEntries: vi.fn(async () => [
    {
      id: 'sig_7ad40676c42fb9c96e2a8136',
      canonicalUrl: 'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136',
      productName: 'The Ordinary Multi-Peptide Lash and Brow Serum',
      hasPdpContent: true,
      isIndexable: true,
      updatedAt: '2026-05-04T18:00:39Z',
    },
  ]),
}));

describe('ProductsPage internal linking surface', () => {
  it('renders pure HTML links to canonical ProductEntity PDPs', async () => {
    const { default: ProductsPage } = await import('./page');
    const element = await ProductsPage();

    render(element);

    expect(screen.getByText('Browse client')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /multi-peptide lash/i })).toHaveAttribute(
      'href',
      '/products/sig_7ad40676c42fb9c96e2a8136',
    );
  });
});
