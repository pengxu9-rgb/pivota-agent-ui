import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BeautyBrandCard } from './BeautyBrandCard';

describe('BeautyBrandCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('falls back to a brand landing href when no explicit brandHref is provided', () => {
    render(<BeautyBrandCard brandName="Tom Ford Beauty" />);

    expect(screen.getByRole('link', { name: /Tom Ford Beauty/i })).toHaveAttribute(
      'href',
      '/brands/tom-ford-beauty?name=Tom+Ford+Beauty',
    );
  });

  it('uses an explicit brandHref when provided', () => {
    render(<BeautyBrandCard brandName="Tom Ford Beauty" brandHref="/brands/tom-ford?name=Tom%20Ford" />);

    expect(screen.getByRole('link', { name: /Tom Ford Beauty/i })).toHaveAttribute(
      'href',
      '/brands/tom-ford?name=Tom%20Ford',
    );
  });
});
