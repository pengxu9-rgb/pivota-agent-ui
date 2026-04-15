import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OverviewSection } from './OverviewSection';

vi.mock('next/image', () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      priority?: boolean;
      fetchPriority?: string;
    },
  ) => {
    const { fill: _fill, priority: _priority, fetchPriority: _fetchPriority, alt, ...rest } = props;
    return <img {...rest} alt={typeof alt === 'string' ? alt : ''} />;
  },
}));

describe('OverviewSection', () => {
  it('renders long overview prose as segmented summary with an image', () => {
    render(
      <OverviewSection
        content={{
          summary:
            'Naturally radiant, this tinted fluid sunscreen balances hydration and control. Its silky texture blends seamlessly for sheer, natural coverage. Infused with hydrating ingredients, it leaves skin glowing yet balanced.',
          highlights: [],
          facts: [],
          body: [],
        }}
        image={{ url: 'https://example.com/overview.jpg', alt: 'Daily sunscreen overview' }}
      />,
    );

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(
      screen.getByText('Naturally radiant, this tinted fluid sunscreen balances hydration and control.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Its silky texture blends seamlessly for sheer, natural coverage.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Infused with hydrating ingredients, it leaves skin glowing yet balanced.'),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Daily sunscreen overview')).toHaveAttribute(
      'src',
      'https://example.com/overview.jpg',
    );
  });
});
