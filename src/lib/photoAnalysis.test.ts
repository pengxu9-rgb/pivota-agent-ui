import { describe, expect, it, vi } from 'vitest';
import {
  isSkinPhotoAnalysisSuccess,
  validateSkinPhotoFile,
  SKIN_PHOTO_MAX_BYTES,
} from '@/lib/photoAnalysis';

describe('photoAnalysis client contract helpers', () => {
  it('requires success status and used_photos=true for skin photo success', () => {
    expect(
      isSkinPhotoAnalysisSuccess({
        status: 'success',
        cards: [
          {
            type: 'analysis_story_v2',
            payload: { used_photos: true },
          },
        ],
      }),
    ).toBe(true);

    expect(
      isSkinPhotoAnalysisSuccess({
        status: 'degraded',
        cards: [
          {
            type: 'analysis_story_v2',
            payload: { used_photos: true },
          },
        ],
      }),
    ).toBe(false);

    expect(
      isSkinPhotoAnalysisSuccess({
        status: 'success',
        cards: [
          {
            type: 'analysis_story_v2',
            payload: { used_photos: false },
          },
        ],
      }),
    ).toBe(false);

    expect(
      isSkinPhotoAnalysisSuccess({
        status: 'success',
        cards: [
          {
            type: 'analysis_story_v2',
            payload: { used_photos: true, photo_qc: ['front:degraded'] },
          },
        ],
      }),
    ).toBe(false);
  });

  it('validates supported image type and max size', () => {
    expect(validateSkinPhotoFile({ type: 'image/jpeg', size: 512 })).toBeNull();
    expect(validateSkinPhotoFile({ type: 'image/gif', size: 512 })).toContain('JPG');
    expect(
      validateSkinPhotoFile({
        type: 'image/png',
        size: SKIN_PHOTO_MAX_BYTES + 1,
      }),
    ).toContain('10MB');
  });

  it('keeps the beta flag disabled unless explicitly enabled', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SHOPPING_AGENT_PHOTO_UPLOAD_BETA', '');
    let mod = await import('@/lib/photoAnalysis');
    expect(mod.isShoppingSkinPhotoUploadBetaEnabled()).toBe(false);

    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SHOPPING_AGENT_PHOTO_UPLOAD_BETA', 'true');
    mod = await import('@/lib/photoAnalysis');
    expect(mod.isShoppingSkinPhotoUploadBetaEnabled()).toBe(true);
  });
});
