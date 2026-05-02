import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BeautyReviewsSection } from './BeautyReviewsSection';

describe('BeautyReviewsSection questions rail', () => {
  it('renders PDP-safe excerpts and suppresses zero-reply metadata for official FAQ', () => {
    const longAnswer =
      'This fluid sunscreen wears comfortably under makeup and helps even tone. It also layers well with moisturizer and keeps the finish lightweight through the morning. Users with combination skin usually do well with a thin final layer. If you prefer extra grip under long-wear makeup, let it set for one minute before foundation.';

    render(
      <BeautyReviewsSection
        data={{
          scale: 5,
          rating: 4.6,
          review_count: 28,
          questions: [
            {
              question:
                'Does this sunscreen wear well under makeup when I already use moisturizer and prefer a lightweight finish through the morning?',
              answer: longAnswer,
              source: 'merchant_faq',
              source_label: 'Official FAQ',
              replies: 0,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/Does this sunscreen wear well under makeup/i)).toBeInTheDocument();
    expect(screen.getByText(/This fluid sunscreen wears comfortably under makeup and helps even tone/)).toBeInTheDocument();
    expect(screen.queryByText(/If you prefer extra grip under long-wear makeup/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 replies/i)).not.toBeInTheDocument();
    expect(screen.getByText('Official FAQ')).toBeInTheDocument();
  });
});
