import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import QuestionsListClient from './QuestionsListClient';

const pushMock = vi.fn();
const backMock = vi.fn();
const listQuestionsMock = vi.fn();
const getPdpV2Mock = vi.fn();
const postQuestionMock = vi.fn();

let searchParamsValue = 'product_id=ext_boj_dn350&merchant_id=external_seed';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  listQuestions: (...args: unknown[]) => listQuestionsMock(...args),
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
  postQuestion: (...args: unknown[]) => postQuestionMock(...args),
}));

describe('QuestionsListClient', () => {
  beforeEach(() => {
    searchParamsValue = 'product_id=ext_boj_dn350&merchant_id=external_seed';
    pushMock.mockReset();
    backMock.mockReset();
    listQuestionsMock.mockReset();
    getPdpV2Mock.mockReset();
    postQuestionMock.mockReset();
    listQuestionsMock.mockResolvedValue({ count: 0, items: [] });
    getPdpV2Mock.mockResolvedValue({
      status: 'success',
      modules: [
        {
          type: 'reviews_preview',
          data: {
            scale: 5,
            rating: 0,
            review_count: 0,
            questions: [
              {
                question: 'How do I choose a shade?',
                answer: 'Start with your undertone, then compare nearby shades in natural light.',
                source: 'merchant_faq',
                source_label: 'Official FAQ',
              },
            ],
          },
        },
      ],
    });
    postQuestionMock.mockResolvedValue({ question_id: 101 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders merchant FAQ questions from PDP reviews_preview when community questions are empty', async () => {
    render(<QuestionsListClient />);

    expect(await screen.findByText('How do I choose a shade?')).toBeInTheDocument();
    expect(
      screen.getByText('Start with your undertone, then compare nearby shades in natural light.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Official FAQ')).toBeInTheDocument();
    expect(screen.queryByText('0 replies')).not.toBeInTheDocument();
    expect(screen.queryByText('No questions yet. Be the first to ask!')).not.toBeInTheDocument();
    expect(listQuestionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'ext_boj_dn350',
        limit: 50,
      }),
    );
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'ext_boj_dn350',
        merchant_id: 'external_seed',
        include: ['reviews_preview'],
      }),
    );
  });

  it('keeps community threads clickable while rendering official FAQ as static cards', async () => {
    listQuestionsMock.mockResolvedValue({
      count: 1,
      items: [
        {
          question_id: 88,
          question: 'Can I wear it under makeup?',
          replies: 2,
        },
      ],
    });

    render(<QuestionsListClient />);

    const communityLink = await screen.findByRole('link', { name: /Can I wear it under makeup/i });
    expect(communityLink).toHaveAttribute('href', expect.stringContaining('/community/questions/88?'));
    expect(screen.getByText('How do I choose a shade?')).toBeInTheDocument();
    expect(screen.getByText('Official FAQ').closest('a')).toBeNull();
    expect(screen.getByText('2 replies')).toBeInTheDocument();
    expect(screen.queryByText('0 replies')).not.toBeInTheDocument();
  });

  it('dedupes PDP FAQ against community questions while preserving the community thread link', async () => {
    listQuestionsMock.mockResolvedValue({
      count: 1,
      items: [
        {
          question_id: 88,
          question: 'How do I choose a shade?',
          replies: 1,
        },
      ],
    });

    render(<QuestionsListClient />);

    await waitFor(() => {
      expect(screen.getAllByText('How do I choose a shade?')).toHaveLength(1);
    });
    expect(screen.getByRole('link', { name: /How do I choose a shade/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/community/questions/88?'),
    );
    expect(screen.getByText('Start with your undertone, then compare nearby shades in natural light.')).toBeInTheDocument();
  });

  it('shows sentence-aware excerpts for long official FAQ answers and expands inline', async () => {
    const longAnswer =
      'This fluid sunscreen wears comfortably under makeup and helps even tone. It also layers well with moisturizer and keeps the finish lightweight through the morning. Users with combination skin usually do well with a thin final layer. If you prefer extra grip under long-wear makeup, let it set for one minute before foundation. For very dry skin, add a lighter moisturizer underneath and keep the sunscreen layer thin. Reapply before extended midday sun exposure or after sweating. Some users also prefer applying with fingertips first and then pressing in with a sponge around the nose and chin.';

    getPdpV2Mock.mockResolvedValue({
      status: 'success',
      modules: [
        {
          type: 'reviews_preview',
          data: {
            scale: 5,
            rating: 0,
            review_count: 0,
            questions: [
              {
                question:
                  'Does this sunscreen wear well under makeup when I already use moisturizer and prefer a lightweight finish through the morning?',
                answer: longAnswer,
                source: 'merchant_faq',
                source_label: 'Official FAQ',
              },
            ],
          },
        },
      ],
    });

    render(<QuestionsListClient />);

    expect(await screen.findByText(/This fluid sunscreen wears comfortably under makeup and helps even tone/)).toBeInTheDocument();
    expect(screen.queryByText(/Reapply before extended midday sun exposure or after sweating/)).not.toBeInTheDocument();
    expect(screen.queryByText('0 replies')).not.toBeInTheDocument();

    const readMore = screen.getByRole('button', { name: 'Read more' });
    readMore.click();

    expect(
      await screen.findByText(
        /Reapply before extended midday sun exposure or after sweating/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });
});
