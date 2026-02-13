import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BeautyRecentPurchases } from './BeautyRecentPurchases';
import { GenericRecentPurchases } from './GenericRecentPurchases';

describe('Recent purchases sections', () => {
  it('does not render purchase module when there is no real data', () => {
    const { container: beautyContainer } = render(
      <BeautyRecentPurchases items={[]} showEmpty={false} />,
    );
    const { container: genericContainer } = render(
      <GenericRecentPurchases items={[]} showEmpty={false} />,
    );

    expect(beautyContainer.firstChild).toBeNull();
    expect(genericContainer.firstChild).toBeNull();
  });

  it('renders only real rows and never calls random fallback generation', () => {
    const randomSpy = vi.spyOn(Math, 'random');

    render(
      <BeautyRecentPurchases
        items={[
          { user_label: 'A***', variant_label: 'M', time_label: '2h ago' },
          { user_label: 'B***', variant_label: 'L', time_label: '5h ago' },
        ]}
      />,
    );

    expect(screen.getByText(/Recent Purchases \(2\)/)).toBeInTheDocument();
    expect(randomSpy).not.toHaveBeenCalled();

    randomSpy.mockRestore();
  });
});
