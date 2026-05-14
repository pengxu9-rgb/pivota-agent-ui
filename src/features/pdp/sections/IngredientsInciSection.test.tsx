import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IngredientsInciSection } from './IngredientsInciSection';

afterEach(() => {
  cleanup();
});

describe('IngredientsInciSection', () => {
  it('keeps full INCI text in the DOM while collapsed inside a hidden full panel', () => {
    const ingredientText = 'Water, Glycerin, Niacinamide, Squalane, Panthenol, Ceramide NP';

    render(
      <IngredientsInciSection
        data={{
          title: 'Ingredients',
          raw_text: ingredientText,
        }}
      />,
    );

    const collapsedCopies = screen.getAllByText(ingredientText);
    expect(collapsedCopies.some((element) => element.closest('[hidden]'))).toBe(true);
    expect(collapsedCopies.some((element) => !element.closest('[hidden]'))).toBe(true);

    const toggle = screen.getByRole('button', { name: 'Show full INCI' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide full INCI' })).toHaveAttribute('aria-expanded', 'true');
  });
});
