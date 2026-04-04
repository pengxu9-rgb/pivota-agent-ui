import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StructuredDetailsBlocks } from './StructuredDetailsBlocks';

afterEach(() => {
  cleanup();
});

describe('StructuredDetailsBlocks', () => {
  it('hides low-confidence single active ingredient when ingredients are richer', () => {
    render(
      <StructuredDetailsBlocks
        activeIngredients={{
          title: 'Active Ingredients',
          items: ['Zinc PCA'],
        }}
        ingredientsInci={{
          title: 'Ingredients',
          items: ['Talc', 'Mica', 'Silica', 'Dimethicone', 'Zinc Stearate'],
        }}
        hideLowConfidenceActiveIngredients
      />,
    );

    expect(screen.queryByText('Active Ingredients')).not.toBeInTheDocument();
    expect(screen.getByText('Ingredients')).toBeInTheDocument();
    expect(screen.getByText('Zinc Stearate')).toBeInTheDocument();
  });

  it('renders ingredient items as a readable list and cleans malformed how-to-use steps', () => {
    render(
      <StructuredDetailsBlocks
        ingredientsInci={{
          title: 'Ingredients',
          items: [
            'Ingredients: Talc',
            'Key Ingredients Ingredients: Dimethicone',
            'Please be aware that ingredient lists may change from time to time.',
            '[+/- Mica]',
          ],
          raw_text:
            'Ingredients: Talc, Mica, Silica, Dimethicone, Yellow 5 Lake (ci 19140)] Please be aware that ingredient lists may change from time to time.',
        }}
        howToUse={{
          title: 'How to Use',
          steps: ['-', '1. Apply dry for soft definition.', '5. Blend edges - 6. Deepen the outer corner.'],
          raw_text:
            '1. Apply dry for soft definition. 2. Use the deeper shade to define. 3. Blend edges - 4. Finish with shimmer.',
        }}
      />,
    );

    expect(screen.getByText('Talc')).toBeInTheDocument();
    expect(screen.getByText('Mica')).toBeInTheDocument();
    expect(screen.getByText('Dimethicone')).toBeInTheDocument();
    expect(screen.getByText('Yellow 5 Lake (ci 19140)')).toBeInTheDocument();
    expect(screen.queryByText(/Key Ingredients Ingredients/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Please be aware that ingredient lists/i)).not.toBeInTheDocument();
    expect(screen.queryByText('-')).not.toBeInTheDocument();
    expect(screen.getByText('Apply dry for soft definition.')).toBeInTheDocument();
    expect(screen.getByText('Blend edges')).toBeInTheDocument();
    expect(screen.getByText('Deepen the outer corner.')).toBeInTheDocument();
  });
});
