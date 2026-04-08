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

  it('drops noisy ingredient pollution, keeps intact chemical tokens, and suppresses promo how-to-use', () => {
    render(
      <StructuredDetailsBlocks
        ingredientsInci={{
          title: 'Ingredients (INCI)',
          items: [
            'Water (Aqua/Eau)',
            '1,2-Hexanediol',
            'Hexanediol',
            'PETA-certified vegan and cruelty-free.',
            'Patch test before use.',
            'Caprylic/Capric Triglyceride',
          ],
          raw_text:
            'Water (Aqua/Eau), 1,2-Hexanediol, Caprylic/Capric Triglyceride, PETA-certified vegan and cruelty-free.',
        }}
        howToUse={{
          title: 'How to Use',
          steps: [
            'Pair with a water-based moisturizer for extra moisture.',
            'Shop Now',
          ],
          raw_text:
            'Pair with a water-based moisturizer for extra moisture. Shop Now',
        }}
      />,
    );

    expect(screen.getByText('Water (Aqua/Eau)')).toBeInTheDocument();
    expect(screen.getByText('1,2-Hexanediol')).toBeInTheDocument();
    expect(screen.queryByText(/^Hexanediol$/)).not.toBeInTheDocument();
    expect(screen.getByText('Caprylic/Capric Triglyceride')).toBeInTheDocument();
    expect(screen.queryByText(/PETA-certified vegan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Patch test/i)).not.toBeInTheDocument();
    expect(screen.queryByText('How to Use')).not.toBeInTheDocument();
  });
});
