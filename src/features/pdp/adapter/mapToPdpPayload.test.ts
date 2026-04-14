import { describe, expect, it } from 'vitest';

import { mapToPdpPayload } from './mapToPdpPayload';

describe('mapToPdpPayload review preview text fallback', () => {
  it('preserves preview title and falls back snippet to title when body text is empty', () => {
    const payload = mapToPdpPayload({
      product: {
        product_id: 'p_1',
        merchant_id: 'm_1',
        title: 'Test Product',
        image_url: 'https://cdn.example.com/p1.jpg',
        price: 99,
        currency: 'USD',
        in_stock: true,
        raw_detail: {
          review_summary: {
            scale: 5,
            rating: 4.8,
            review_count: 12,
            preview_items: [
              {
                review_id: 'r_1',
                rating: 5,
                title: 'Only title provided',
                text_snippet: '',
                body: '',
              },
            ],
          },
        },
      } as any,
    });

    const reviewsModule = payload.modules.find((m) => m.type === 'reviews_preview');
    const review = (reviewsModule?.data as any)?.preview_items?.[0];

    expect(review).toBeTruthy();
    expect(review.title).toBe('Only title provided');
    expect(review.text_snippet).toBe('Only title provided');
  });

  it('preserves question source metadata and merchant FAQ fallback', () => {
    const payload = mapToPdpPayload({
      product: {
        product_id: 'p_2',
        merchant_id: 'm_2',
        title: 'Test Product',
        image_url: 'https://cdn.example.com/p2.jpg',
        price: 99,
        currency: 'USD',
        in_stock: true,
        raw_detail: {
          pdp_faq_items: [
            {
              question: 'Can I use this every day?',
              answer: 'Yes, it is gentle enough for daily use.',
            },
          ],
          review_summary: {
            scale: 5,
            rating: 4.8,
            review_count: 12,
            questions: [
              {
                question: 'Is this good for oily skin?',
                answer: 'Reviewers say it feels lightweight on oily skin.',
                source: 'review_derived',
                source_label: 'From reviews',
                support_count: 3,
              },
            ],
          },
        },
      } as any,
    });

    const reviewsModule = payload.modules.find((m) => m.type === 'reviews_preview');
    expect((reviewsModule?.data as any)?.questions).toEqual([
      expect.objectContaining({
        question: 'Can I use this every day?',
        source: 'merchant_faq',
        source_label: 'Official FAQ',
      }),
      expect.objectContaining({
        question: 'Is this good for oily skin?',
        source: 'review_derived',
        source_label: 'From reviews',
        support_count: 3,
      }),
    ]);
  });
});
