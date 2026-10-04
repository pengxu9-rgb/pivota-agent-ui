import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UGC_SNAPSHOT,
  UGC_PREVIEW_PRIORITY_COUNT,
  lockFirstUgcSource,
  mergeUgcItems,
  upsertLockedModule,
} from './freezePolicy';
import type { Module } from '../types';

describe('freezePolicy', () => {
  it('keeps existing module when source is locked', () => {
    const current: Module[] = [
      {
        module_id: 'm_reviews',
        type: 'reviews_preview',
        priority: 50,
        data: { rating: 4.8, review_count: 12 },
      },
    ];

    const next = {
      module_id: 'm_reviews_new',
      type: 'reviews_preview' as const,
      priority: 50,
      data: { rating: 3.1, review_count: 2 },
    };

    const result = upsertLockedModule({
      currentModules: current,
      type: 'reviews_preview',
      nextModule: next,
      locked: true,
    });

    expect(result.changed).toBe(false);
    expect(result.locked).toBe(true);
    expect(result.modules[0]?.module_id).toBe('m_reviews');
  });

  it('updates module and locks after first render when unlocked', () => {
    const next = {
      module_id: 'm_recs',
      type: 'recommendations' as const,
      priority: 20,
      data: { items: [{ product_id: '1', title: 'A' }] },
    };

    const result = upsertLockedModule({
      currentModules: [],
      type: 'recommendations',
      nextModule: next,
      locked: false,
    });

    expect(result.changed).toBe(true);
    expect(result.locked).toBe(true);
    expect(result.modules[0]?.module_id).toBe('m_recs');
  });

  it('never locks or fills customer previews using gallery media or unproven review media', () => {
    const items = [{ type: 'image' as const, url: 'https://a.example/official.jpg' }];
    expect(lockFirstUgcSource({ current: DEFAULT_UGC_SNAPSHOT, reviewsItems: items, mediaItems: items })).toBe(DEFAULT_UGC_SNAPSHOT);
    expect(mergeUgcItems({ reviewsItems: items, mediaItems: items })).toEqual([]);
  });
});
