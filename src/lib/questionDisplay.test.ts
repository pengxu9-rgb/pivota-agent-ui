import { describe, expect, it } from 'vitest';

import { isQuestionDisplayTruncated, resolveQuestionDisplay } from './questionDisplay';

describe('questionDisplay', () => {
  it('uses backend display contract when available', () => {
    const item = {
      question: 'Can I use this every day?',
      answer: 'Yes. Use it after cleansing.',
      display: {
        pdp: {
          question: 'Can I use this every day?',
          answer: 'Yes. Use it after cleansing.',
        },
      },
    };

    expect(resolveQuestionDisplay(item, 'pdp')).toEqual({
      question: 'Can I use this every day?',
      answer: 'Yes. Use it after cleansing.',
    });
  });

  it('builds sentence-aware fallback excerpts', () => {
    const answer =
      'This fluid sunscreen wears comfortably under makeup and helps even tone. It also layers well with moisturizer and keeps the finish lightweight through the morning. Users with combination skin usually do well with a thin final layer. If you prefer extra grip under long-wear makeup, let it set for one minute before foundation. For very dry skin, add a lighter moisturizer underneath and keep the sunscreen layer thin.';

    const pdp = resolveQuestionDisplay(
      {
        question:
          'Does this sunscreen wear well under makeup when I already use moisturizer and prefer a lightweight finish through the morning?',
        answer,
      },
      'pdp',
    );

    expect(pdp.question.endsWith('…')).toBe(true);
    expect(pdp.answer).toContain('This fluid sunscreen wears comfortably under makeup and helps even tone.');
    expect(pdp.answer).toContain('It also layers well with moisturizer and keeps the finish lightweight through the morning.');
    expect(pdp.answer?.endsWith('…')).toBe(true);
    expect(pdp.answer_truncated).toBe(true);
    expect(isQuestionDisplayTruncated({ question: 'Short question', answer }, 'pdp')).toBe(true);
  });
});
