'use client';

// NOTE: Kept as a separate client component so `page.tsx` can wrap it in `Suspense`
// (required by Next.js when using `useSearchParams`).

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import {
  attachReviewMediaFromUser,
  createReviewFromUser,
  getPdpV2,
  getPdpV2Personalization,
  getReviewEligibility,
  type GetPdpV2Response,
  getProductDetail,
  type ProductResponse,
  type UgcCapabilities,
} from '@/lib/api';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { PDPPayload } from '@/features/pdp/types';
import { pdpTracking } from '@/features/pdp/tracking';
import { cn } from '@/lib/utils';
import { resolveReviewGate, reviewGateMessage, reviewGateResultToReason, type ReviewGateResult } from '@/lib/reviewGate';

const MAX_MEDIA_FILES = 5;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_MEDIA_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

type TokenSubject = {
  merchant_id: string;
  platform: string;
  platform_product_id: string;
  variant_id?: string;
};

type SubmissionTokenPayload = {
  exp?: number;
  jti?: string;
  merchant_id?: string;
  subjects?: TokenSubject[];
  verification?: string;
};

function b64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + '='.repeat(padLen);
  return atob(padded);
}

function decodeSubmissionToken(token: string): SubmissionTokenPayload | null {
  const [payloadPart] = (token || '').split('.', 1);
  if (!payloadPart) return null;
  try {
    const json = b64UrlToUtf8(payloadPart);
    return JSON.parse(json) as SubmissionTokenPayload;
  } catch {
    return null;
  }
}

function parseInvitationTokenFromHash(hash: string): string | null {
  const h = (hash || '').replace(/^#/, '').trim();
  if (!h) return null;
  const params = new URLSearchParams(h);
  const t = params.get('invitation_token');
  return t ? t.trim() : null;
}

function safeString(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input == null) return '';
  return String(input);
}

function inferPlatformFromProductId(productId: string): string | null {
  const pid = safeString(productId).trim();
  if (!pid) return null;
  if (/^\d{10,}$/.test(pid) || /^gid:\/\/shopify\//.test(pid)) return 'shopify';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pid)) {
    return 'wix';
  }
  return null;
}

function parsePlatformFromProductKey(productKey: string): string | null {
  const key = safeString(productKey).trim();
  if (!key) return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const platform = key.slice(0, idx).trim().toLowerCase();
  return platform || null;
}

async function fetchSubjectRefFromProductDetail(args: {
  merchantId?: string | null;
  productId: string;
}): Promise<{ merchant_id: string; platform: string; platform_product_id: string } | null> {
  const merchantId = safeString(args.merchantId).trim();
  const productId = safeString(args.productId).trim();
  if (!productId) return null;

  try {
    const product = await getProductDetail(productId, merchantId || undefined);
    if (!product) return null;
    const resolvedMerchantId = safeString((product as any).merchant_id).trim() || merchantId;
    const resolvedPlatform = safeString((product as any).platform || (product as any).product_ref?.platform)
      .trim()
      .toLowerCase();
    const resolvedPlatformProductId = safeString(
      (product as any).platform_product_id ||
        (product as any).product_ref?.platform_product_id ||
        (product as any).product_id ||
        productId,
    ).trim();
    if (!resolvedMerchantId || !resolvedPlatform || !resolvedPlatformProductId) return null;
    return {
      merchant_id: resolvedMerchantId,
      platform: resolvedPlatform,
      platform_product_id: resolvedPlatformProductId,
    };
  } catch {
    return null;
  }
}

function isAllowedMediaFile(file: File): boolean {
  const type = String(file.type || '').trim().toLowerCase();
  if (type && ALLOWED_MEDIA_TYPES.has(type)) return true;
  const ext = String(file.name || '')
    .split('.')
    .pop()
    ?.trim()
    .toLowerCase();
  return Boolean(ext && ALLOWED_MEDIA_EXTENSIONS.has(ext));
}

function readReviewIdFromCapabilities(caps?: UgcCapabilities | null): number | null {
  const rid = Number((caps as any)?.review?.review_id);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  return Math.trunc(rid);
}

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, idx) => {
        const v = idx + 1;
        const active = v <= value;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            className={cn(
              'p-1 rounded-lg transition-colors',
              disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/5',
            )}
            onClick={() => onChange(v)}
            aria-label={`Rate ${v} star${v === 1 ? '' : 's'}`}
          >
            <Star
              className={cn('h-6 w-6', active ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')}
            />
          </button>
        );
      })}
      <span className="ml-2 text-sm text-muted-foreground">{value}/5</span>
    </div>
  );
}

const trackReviewEvent = (event: string, payload: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log('[TRACK]', event, {
    ...payload,
    ts: new Date().toISOString(),
  });
};

export default function WriteReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const productIdParam = (searchParams.get('product_id') || searchParams.get('productId') || '').trim() || null;
  const merchantIdParam = (searchParams.get('merchant_id') || searchParams.get('merchantId') || '').trim() || null;
  const entryParam = (searchParams.get('entry') || '').trim().toLowerCase();

  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [submissionToken, setSubmissionToken] = useState<string | null>(null);
  const [submissionPayload, setSubmissionPayload] = useState<SubmissionTokenPayload | null>(null);
  const [selectedSubjectIdx, setSelectedSubjectIdx] = useState(0);
  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewId, setReviewId] = useState<number | null>(null);

  const [inAppPdp, setInAppPdp] = useState<{ payload: PDPPayload; subject: GetPdpV2Response['subject'] | null } | null>(null);
  const [inAppEligibility, setInAppEligibility] = useState<{ eligible: boolean; reason?: string } | null>(null);
  const [invitationEligibility, setInvitationEligibility] = useState<{ eligible: boolean; reason?: string } | null>(null);
  const [inAppCapabilities, setInAppCapabilities] = useState<UgcCapabilities | null>(null);
  const [invitationCapabilities, setInvitationCapabilities] = useState<UgcCapabilities | null>(null);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedMediaFiles, setSelectedMediaFiles] = useState<File[]>([]);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const subjects = useMemo(() => submissionPayload?.subjects || [], [submissionPayload]);
  const activeSubject = subjects[selectedSubjectIdx] || null;
  const inAppExistingReviewId = useMemo(
    () => readReviewIdFromCapabilities(inAppCapabilities),
    [inAppCapabilities],
  );
  const invitationExistingReviewId = useMemo(
    () => readReviewIdFromCapabilities(invitationCapabilities),
    [invitationCapabilities],
  );
  const mode = useMemo(() => {
    if (invitationToken) return 'invitation';
    if (productIdParam) return 'in_app';
    return 'missing';
  }, [invitationToken, productIdParam]);

  const requireLoginForReview = () => {
    const redirect = `${window.location.pathname}${window.location.search}`;
    toast.message('Please log in to write a review.');
    router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
  };

  const handleBlockedReviewGate = (gate: ReviewGateResult): boolean => {
    if (gate === 'ALLOW_WRITE') return false;
    if (gate === 'REQUIRE_LOGIN') {
      requireLoginForReview();
      return true;
    }
    const message = reviewGateMessage(gate);
    if (message) toast.message(message);
    return true;
  };

  useEffect(() => {
    const fromHash = parseInvitationTokenFromHash(window.location.hash);
    const fromSession = productIdParam ? null : window.sessionStorage.getItem('pivota_reviews_invitation_token');
    const token = (fromHash || fromSession || '').trim() || null;

    if (fromHash) {
      window.sessionStorage.setItem('pivota_reviews_invitation_token', fromHash);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (productIdParam && !fromHash) {
      // In-app flow should not be hijacked by a stale invitation token from a previous deep link.
      window.sessionStorage.removeItem('pivota_reviews_invitation_token');
      window.sessionStorage.removeItem('pivota_reviews_submission_token');
    }

    setInvitationToken(token);
  }, [productIdParam]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!invitationToken) {
        // In-app flow (no token) uses query params; don't show the "missing token" state.
        if (productIdParam) return;
        setLoading(false);
        return;
      }

      setLoading(true);

      const cachedToken = window.sessionStorage.getItem('pivota_reviews_submission_token');
      if (cachedToken) {
        const payload = decodeSubmissionToken(cachedToken);
        if (payload?.merchant_id && Array.isArray(payload.subjects) && payload.subjects.length) {
          setSubmissionToken(cachedToken);
          setSubmissionPayload(payload);
          setLoading(false);
          return;
        }
      }

      try {
        const res = await fetch('/api/reviews/buyer/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: invitationToken, ttl_seconds: 3600 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = (data?.detail || data?.error || data?.message || 'Failed to exchange invitation') as string;
          throw new Error(detail);
        }

        const token = String(data?.submission_token || '').trim();
        const payload = decodeSubmissionToken(token);
        if (!token || !payload?.merchant_id || !Array.isArray(payload.subjects) || !payload.subjects.length) {
          throw new Error('Invalid submission token');
        }

        if (!cancelled) {
          window.sessionStorage.setItem('pivota_reviews_submission_token', token);
          setSubmissionToken(token);
          setSubmissionPayload(payload);
        }
      } catch (e) {
        console.error(e);
        toast.error((e as Error).message || 'Unable to start review');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [invitationToken, productIdParam]);

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      if (mode !== 'invitation') {
        setProduct(null);
        setInvitationEligibility(null);
        setInvitationCapabilities(null);
        return;
      }
      if (!activeSubject) {
        setProduct(null);
        setInvitationEligibility(null);
        setInvitationCapabilities(null);
        return;
      }
      try {
        const p = await getProductDetail(activeSubject.platform_product_id, activeSubject.merchant_id);
        if (!cancelled) setProduct(p);
      } catch {
        if (!cancelled) setProduct(null);
      }
    }

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [activeSubject, mode]);

  const invitationProductIdForEligibility = useMemo(() => {
    if (!activeSubject) return '';
    return String(product?.product_id || activeSubject.platform_product_id || '').trim();
  }, [activeSubject, product?.product_id]);

  const invitationProductGroupIdForEligibility = useMemo(() => {
    const groupId = String((product as any)?.product_group_id || '').trim();
    return groupId || null;
  }, [product]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (mode !== 'invitation' || !invitationProductIdForEligibility) {
        setInvitationEligibility(null);
        setInvitationCapabilities(null);
        return;
      }
      if (!userId) {
        setInvitationEligibility(null);
        setInvitationCapabilities(null);
        return;
      }
      try {
        const [elig, personalization] = await Promise.all([
          getReviewEligibility({
            productId: invitationProductIdForEligibility,
            ...(invitationProductGroupIdForEligibility ? { productGroupId: invitationProductGroupIdForEligibility } : {}),
          }),
          getPdpV2Personalization({
            productId: invitationProductIdForEligibility,
            ...(invitationProductGroupIdForEligibility ? { productGroupId: invitationProductGroupIdForEligibility } : {}),
          }),
        ]);
        if (!cancelled) {
          setInvitationEligibility(elig as any);
          setInvitationCapabilities((personalization as any)?.ugcCapabilities || null);
        }
      } catch {
        // Ignore eligibility failures; server will enforce on submit.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, invitationProductIdForEligibility, invitationProductGroupIdForEligibility, userId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (mode !== 'in_app' || !productIdParam) {
        setInAppPdp(null);
        setInAppEligibility(null);
        setInAppCapabilities(null);
        return;
      }

      setLoading(true);
      setSubmissionToken(null);
      setSubmissionPayload(null);
      setInAppPdp(null);
      setInAppEligibility(null);
      setInAppCapabilities(null);

      try {
        const v2 = await getPdpV2({
          product_id: productIdParam,
          ...(merchantIdParam ? { merchant_id: merchantIdParam } : {}),
          include: [],
          timeout_ms: 20000,
        });
        if (cancelled) return;
        const payload = mapPdpV2ToPdpPayload(v2);
        if (!payload) throw new Error('Invalid PDP response');

        setInAppPdp({ payload, subject: v2.subject || null });

        if (userId) {
          const [elig, personalization] = await Promise.all([
            getReviewEligibility({
              productId: productIdParam,
              ...(payload.product_group_id ? { productGroupId: payload.product_group_id } : {}),
            }),
            getPdpV2Personalization({
              productId: productIdParam,
              ...(payload.product_group_id ? { productGroupId: payload.product_group_id } : {}),
            }),
          ]);
          if (!cancelled) {
            setInAppEligibility(elig as any);
            setInAppCapabilities((personalization as any)?.ugcCapabilities || null);
          }
        }
      } catch (err) {
        console.error(err);
        toast.error((err as Error)?.message || 'Failed to load product');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, productIdParam, merchantIdParam, userId]);

  const handleMediaInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []);
    if (!incoming.length) return;

    let invalidType = 0;
    let tooLarge = 0;
    let overflow = 0;

    setSelectedMediaFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_MEDIA_FILES) {
          overflow += 1;
          continue;
        }
        if (!isAllowedMediaFile(file)) {
          invalidType += 1;
          continue;
        }
        if (file.size > MAX_MEDIA_BYTES) {
          tooLarge += 1;
          continue;
        }
        next.push(file);
      }
      return next;
    });

    if (invalidType > 0) {
      toast.message('Only JPG, PNG, WEBP, or GIF images are supported.');
    }
    if (tooLarge > 0) {
      toast.message('Each image must be 10MB or smaller.');
    }
    if (overflow > 0) {
      toast.message(`You can upload up to ${MAX_MEDIA_FILES} images.`);
    }

    event.target.value = '';
  };

  const removeMediaAt = (index: number) => {
    setSelectedMediaFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const uploadSelectedMedia = async (
    targetReviewId: number,
  ): Promise<{ success: number; failed: number }> => {
    if (!selectedMediaFiles.length) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;
    for (const file of selectedMediaFiles) {
      try {
        await attachReviewMediaFromUser(targetReviewId, file);
        success += 1;
      } catch {
        failed += 1;
      }
    }
    return { success, failed };
  };

  const trackUploadEvent = (
    eventName: 'ugc_upload_start' | 'ugc_upload_success' | 'ugc_upload_partial_fail',
    payload: Record<string, unknown>,
  ) => {
    pdpTracking.track(eventName, {
      flow: mode,
      entry: entryParam || null,
      product_id: productIdParam || invitationProductIdForEligibility || null,
      merchant_id: merchantIdParam || activeSubject?.merchant_id || null,
      ...payload,
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const mediaCount = selectedMediaFiles.length;
    const hasMedia = mediaCount > 0;

    if (mode === 'invitation') {
      if (!activeSubject) return;

      const invitationGate = resolveReviewGate({
        isAuthenticated: Boolean(user),
        eligibility: invitationEligibility || null,
      });
      trackReviewEvent('pdp_review_gate_total', {
        entry_surface: 'write_review_page',
        mode: 'invitation',
        review_gate_reason: reviewGateResultToReason(invitationGate),
      });
      if (handleBlockedReviewGate(invitationGate)) {
        return;
      }
      const invitationReason = String(invitationEligibility?.reason || '').toUpperCase();
      const canUseExistingReview =
        invitationReason === 'ALREADY_REVIEWED' && invitationExistingReviewId != null;
      if (canUseExistingReview && !hasMedia) {
        toast.message('You already reviewed this product. Add photos to upload.');
        return;
      }

      if (!invitationProductIdForEligibility && !canUseExistingReview) {
        toast.error('Missing product context.');
        return;
      }

      setSubmitting(true);
      try {
        let targetReviewId = invitationExistingReviewId;
        let createdReview = false;

        if (!targetReviewId) {
          const data = await createReviewFromUser({
            productId: invitationProductIdForEligibility,
            ...(invitationProductGroupIdForEligibility ? { productGroupId: invitationProductGroupIdForEligibility } : {}),
            subject: {
              merchant_id: activeSubject.merchant_id,
              platform: activeSubject.platform,
              platform_product_id: activeSubject.platform_product_id,
              variant_id: activeSubject.variant_id || null,
            },
            rating,
            title: title.trim() || null,
            body: body.trim() || null,
          });

          const rid = Number((data as any)?.review_id);
          if (!Number.isFinite(rid) || rid <= 0) {
            throw new Error('Missing review id.');
          }
          targetReviewId = Math.trunc(rid);
          createdReview = true;
        }

        if (hasMedia) {
          trackUploadEvent('ugc_upload_start', {
            review_id: targetReviewId,
            file_count: mediaCount,
            created_review: createdReview,
          });
        }
        const uploadSummary = await uploadSelectedMedia(targetReviewId);
        setReviewId(targetReviewId);
        setSelectedMediaFiles([]);
        if (mediaInputRef.current) mediaInputRef.current.value = '';

        if (hasMedia) {
          if (uploadSummary.success === mediaCount) {
            trackUploadEvent('ugc_upload_success', {
              review_id: targetReviewId,
              file_count: mediaCount,
              success_count: uploadSummary.success,
              failed_count: uploadSummary.failed,
              created_review: createdReview,
            });
            toast.success(createdReview ? 'Review and photos submitted.' : 'Photos uploaded.');
          } else {
            trackUploadEvent('ugc_upload_partial_fail', {
              review_id: targetReviewId,
              file_count: mediaCount,
              success_count: uploadSummary.success,
              failed_count: uploadSummary.failed,
              created_review: createdReview,
            });
            if (uploadSummary.success > 0) {
              toast.message(`Uploaded ${uploadSummary.success} photo(s); ${uploadSummary.failed} failed.`);
            } else {
              toast.error(createdReview ? 'Review submitted, but photo upload failed.' : 'Photo upload failed.');
            }
          }
        } else {
          toast.success(createdReview ? 'Review submitted' : 'Review updated');
        }
        trackReviewEvent('review_submit_total', {
          entry_surface: 'write_review_page',
          mode: 'invitation',
          result: 'success',
        });
      } catch (err: any) {
        if (err?.code === 'NOT_AUTHENTICATED' || err?.status === 401) {
          requireLoginForReview();
        } else if (err?.code === 'NOT_PURCHASER' || err?.status === 403) {
          toast.error('Only purchasers can write a review.');
        } else if (err?.code === 'ALREADY_REVIEWED' || err?.status === 409) {
          toast.error('You already reviewed this product.');
        } else {
          toast.error(err?.message || 'Submit failed');
        }
        trackReviewEvent('review_submit_total', {
          entry_surface: 'write_review_page',
          mode: 'invitation',
          result: 'failed',
          error_code: err?.code || null,
          error_status: err?.status || null,
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode !== 'in_app' || !productIdParam || !inAppPdp?.payload) return;

    const inAppGate = resolveReviewGate({
      isAuthenticated: Boolean(user),
      eligibility: inAppEligibility || null,
    });
      trackReviewEvent('pdp_review_gate_total', {
        entry_surface: 'write_review_page',
        mode: 'in_app',
        review_gate_reason: reviewGateResultToReason(inAppGate),
      });
      if (handleBlockedReviewGate(inAppGate)) {
      return;
    }
    const inAppReason = String(inAppEligibility?.reason || '').toUpperCase();
    const canUseExistingReview = inAppReason === 'ALREADY_REVIEWED' && inAppExistingReviewId != null;
    if (canUseExistingReview && !hasMedia) {
      toast.message('You already reviewed this product. Add photos to upload.');
      return;
    }

    setSubmitting(true);
    try {
      let targetReviewId = inAppExistingReviewId;
      let createdReview = false;

      if (!targetReviewId) {
        const canonicalRaw =
          (inAppPdp.subject as any)?.canonical_product_ref ||
          (inAppPdp.subject as any)?.canonicalProductRef ||
          null;

        let resolvedMerchantId =
          safeString(canonicalRaw?.merchant_id || canonicalRaw?.merchantId).trim() ||
          safeString(merchantIdParam).trim() ||
          safeString((inAppPdp.payload as any)?.product?.merchant_id).trim() ||
          safeString((inAppPdp.payload as any)?.offers?.[0]?.merchant_id).trim();

        let resolvedPlatform =
          safeString(canonicalRaw?.platform).trim().toLowerCase() ||
          parsePlatformFromProductKey(
            safeString(
              (inAppPdp.subject as any)?.product_key ||
                (inAppPdp.subject as any)?.productKey ||
                (inAppPdp.subject as any)?.id,
            ),
          ) ||
          '';

        let resolvedPlatformProductId =
          safeString(
            canonicalRaw?.platform_product_id ||
              canonicalRaw?.platformProductId ||
              canonicalRaw?.product_id ||
              canonicalRaw?.productId,
          ).trim() || productIdParam;

        if (!resolvedMerchantId || !resolvedPlatform || !resolvedPlatformProductId) {
          const fromDetail = await fetchSubjectRefFromProductDetail({
            merchantId: resolvedMerchantId || merchantIdParam,
            productId: resolvedPlatformProductId || productIdParam,
          });
          if (fromDetail) {
            if (!resolvedMerchantId) resolvedMerchantId = fromDetail.merchant_id;
            if (!resolvedPlatform) resolvedPlatform = fromDetail.platform;
            if (!resolvedPlatformProductId) resolvedPlatformProductId = fromDetail.platform_product_id;
          }
        }

        if (!resolvedPlatform) {
          const inferred = inferPlatformFromProductId(resolvedPlatformProductId || productIdParam);
          if (inferred) resolvedPlatform = inferred;
        }

        if (!resolvedMerchantId || !resolvedPlatform || !resolvedPlatformProductId) {
          throw new Error('Missing canonical product reference.');
        }

        const data = await createReviewFromUser({
          productId: productIdParam,
          ...(inAppPdp.payload.product_group_id ? { productGroupId: inAppPdp.payload.product_group_id } : {}),
          subject: {
            merchant_id: resolvedMerchantId,
            platform: resolvedPlatform,
            platform_product_id: resolvedPlatformProductId,
            variant_id: null,
          },
          rating,
          title: title.trim() || null,
          body: body.trim() || null,
        });

        const rid = Number((data as any)?.review_id);
        if (!Number.isFinite(rid) || rid <= 0) {
          throw new Error('Missing review id.');
        }
        targetReviewId = Math.trunc(rid);
        createdReview = true;
      }

      if (hasMedia) {
        trackUploadEvent('ugc_upload_start', {
          review_id: targetReviewId,
          file_count: mediaCount,
          created_review: createdReview,
        });
      }
      const uploadSummary = await uploadSelectedMedia(targetReviewId);
      setReviewId(targetReviewId);
      setSelectedMediaFiles([]);
      if (mediaInputRef.current) mediaInputRef.current.value = '';

      if (hasMedia) {
        if (uploadSummary.success === mediaCount) {
          trackUploadEvent('ugc_upload_success', {
            review_id: targetReviewId,
            file_count: mediaCount,
            success_count: uploadSummary.success,
            failed_count: uploadSummary.failed,
            created_review: createdReview,
          });
          toast.success(createdReview ? 'Review and photos submitted.' : 'Photos uploaded.');
        } else {
          trackUploadEvent('ugc_upload_partial_fail', {
            review_id: targetReviewId,
            file_count: mediaCount,
            success_count: uploadSummary.success,
            failed_count: uploadSummary.failed,
            created_review: createdReview,
          });
          if (uploadSummary.success > 0) {
            toast.message(`Uploaded ${uploadSummary.success} photo(s); ${uploadSummary.failed} failed.`);
          } else {
            toast.error(createdReview ? 'Review submitted, but photo upload failed.' : 'Photo upload failed.');
          }
        }
        } else {
          toast.success(createdReview ? 'Review submitted' : 'Review updated');
        }
      trackReviewEvent('review_submit_total', {
        entry_surface: 'write_review_page',
        mode: 'in_app',
        result: 'success',
      });
    } catch (err: any) {
      if (err?.code === 'NOT_AUTHENTICATED' || err?.status === 401) {
        requireLoginForReview();
      } else if (err?.code === 'NOT_PURCHASER' || err?.status === 403) {
        toast.error('Only purchasers can write a review.');
      } else if (err?.code === 'ALREADY_REVIEWED' || err?.status === 409) {
        toast.error('You already reviewed this product.');
      } else {
        toast.error(err?.message || 'Submit failed');
      }
      trackReviewEvent('review_submit_total', {
        entry_surface: 'write_review_page',
        mode: 'in_app',
        result: 'failed',
        error_code: err?.code || null,
        error_status: err?.status || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const invitationBlocked =
    Boolean(invitationEligibility && !invitationEligibility.eligible) &&
    !(
      String(invitationEligibility?.reason || '').toUpperCase() === 'ALREADY_REVIEWED' &&
      invitationExistingReviewId != null
    );
  const inAppBlocked =
    Boolean(inAppEligibility && !inAppEligibility.eligible) &&
    !(String(inAppEligibility?.reason || '').toUpperCase() === 'ALREADY_REVIEWED' && inAppExistingReviewId != null);

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-6 md:p-8 space-y-6 border border-border">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Write a review</h1>
          <p className="text-sm text-muted-foreground">Your feedback helps other buyers and the merchant improve.</p>
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading...</div>}

        {!loading && mode === 'missing' && (
          <div className="text-sm text-muted-foreground">
            Missing invitation token. Please open the link from your invitation email.
          </div>
        )}

        {!loading && mode === 'invitation' && invitationToken && !submissionToken && (
          <div className="text-sm text-muted-foreground">
            This invitation cannot be used. It may have expired or was already used.
          </div>
        )}

        {!loading && mode === 'invitation' && submissionToken && (
          <>
            {subjects.length > 1 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Select item</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {subjects.map((s, idx) => (
                    <button
                      key={`${s.platform}:${s.platform_product_id}:${s.variant_id || ''}:${idx}`}
                      type="button"
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-left transition-colors',
                        idx === selectedSubjectIdx
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-border bg-white/40 hover:bg-white/60',
                      )}
                      onClick={() => setSelectedSubjectIdx(idx)}
                    >
                      <div className="text-sm font-semibold text-foreground line-clamp-1">
                        {product && idx === selectedSubjectIdx ? product.title : `Product ${idx + 1}`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.platform} · {s.platform_product_id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSubject && (
              <div className="flex gap-4 items-center rounded-2xl border border-border bg-white/50 p-4">
                <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-black/5 shrink-0">
                  {product?.image_url ? (
                    <Image src={product.image_url} alt={product.title} fill className="object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground line-clamp-1">{product?.title || 'Product'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {activeSubject.platform} · {activeSubject.platform_product_id}
                  </div>
                </div>
              </div>
            )}

            {reviewId != null ? (
              <div className="rounded-2xl border border-border bg-white/50 p-4 text-sm">
                <div className="font-semibold text-foreground">Thanks!</div>
                <div className="text-muted-foreground mt-1">
                  Review received (ID: {reviewId}). It may appear after moderation.
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      window.sessionStorage.removeItem('pivota_reviews_invitation_token');
                      window.sessionStorage.removeItem('pivota_reviews_submission_token');
                      window.location.reload();
                    }}
                  >
                    Submit another (new link)
                  </Button>
                </div>
              </div>
            ) : !user ? (
              <div className="rounded-2xl border border-border bg-white/50 p-4 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Login required</div>
                <div className="mt-1">Please log in to write a review.</div>
                <div className="mt-3">
                  <Button
                    type="button"
                    onClick={() => {
                      const redirect = `${window.location.pathname}${window.location.search}`;
                      router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
                    }}
                  >
                    Log in
                  </Button>
                </div>
              </div>
            ) : invitationBlocked ? (
              <div className="rounded-2xl border border-border bg-white/50 p-4 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Not eligible</div>
                <div className="mt-1">
                  {String(invitationEligibility?.reason || '').toUpperCase() === 'ALREADY_REVIEWED'
                    ? 'You already reviewed this product.'
                    : 'Only purchasers can write a review.'}
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Rating</div>
                  <StarRating value={rating} onChange={setRating} disabled={submitting} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Title (optional)</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={submitting}
                    maxLength={200}
                    className="w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Summarize your experience"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Review (optional)</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={submitting}
                    maxLength={5000}
                    rows={6}
                    className="w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="What did you like or dislike?"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Photos (optional)</label>
                    <span className="text-xs text-muted-foreground">
                      {selectedMediaFiles.length}/{MAX_MEDIA_FILES}
                    </span>
                  </div>
                  {entryParam === 'ugc_upload' ? (
                    <p className="text-xs text-muted-foreground">
                      Add photos from your gallery. We keep successful uploads even if some files fail.
                    </p>
                  ) : null}
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleMediaInputChange}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting || selectedMediaFiles.length >= MAX_MEDIA_FILES}
                      onClick={() => mediaInputRef.current?.click()}
                    >
                      Add photos
                    </Button>
                    <span className="text-xs text-muted-foreground">Max 5 images, 10MB each.</span>
                  </div>
                  {selectedMediaFiles.length ? (
                    <div className="space-y-2">
                      {selectedMediaFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${file.size}-${idx}`}
                          className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-xs"
                        >
                          <span className="truncate pr-2">{file.name}</span>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => removeMediaAt(idx)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    We put your invitation token in the URL fragment to reduce leakage.
                  </div>
                  <Button type="submit" variant="gradient" disabled={submitting || !activeSubject}>
                    {submitting ? 'Submitting...' : 'Submit review'}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
        {!loading && mode === 'in_app' && (
          <>
            {!user ? (
              <div className="rounded-2xl border border-border bg-white/50 p-4 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Login required</div>
                <div className="mt-1">Please log in to write a review.</div>
                <div className="mt-3">
                  <Button
                    type="button"
                    onClick={() => {
                      const redirect = `${window.location.pathname}${window.location.search}`;
                      router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
                    }}
                  >
                    Log in
                  </Button>
                </div>
              </div>
            ) : inAppBlocked ? (
              <div className="rounded-2xl border border-border bg-white/50 p-4 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Not eligible</div>
                <div className="mt-1">
                  {String(inAppEligibility?.reason || '').toUpperCase() === 'ALREADY_REVIEWED'
                    ? 'You already reviewed this product.'
                    : 'Only purchasers can write a review.'}
                </div>
              </div>
            ) : inAppPdp?.payload ? (
              <>
                <div className="flex gap-4 items-center rounded-2xl border border-border bg-white/50 p-4">
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-black/5 shrink-0">
                    {inAppPdp.payload.product.image_url ? (
                      <Image
                        src={inAppPdp.payload.product.image_url}
                        alt={inAppPdp.payload.product.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground line-clamp-1">{inAppPdp.payload.product.title}</div>
                  </div>
                </div>

                {reviewId != null ? (
                  <div className="rounded-2xl border border-border bg-white/50 p-4 text-sm">
                    <div className="font-semibold text-foreground">Thanks!</div>
                    <div className="text-muted-foreground mt-1">
                      Review received (ID: {reviewId}). It may appear after moderation.
                    </div>
                  </div>
                ) : (
                  <form onSubmit={submit} className="space-y-5">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">Rating</div>
                      <StarRating value={rating} onChange={setRating} disabled={submitting} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Title (optional)</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={submitting}
                        maxLength={200}
                        className="w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Summarize your experience"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Review (optional)</label>
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        disabled={submitting}
                        maxLength={5000}
                        rows={6}
                        className="w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="What did you like or dislike?"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">Photos (optional)</label>
                        <span className="text-xs text-muted-foreground">
                          {selectedMediaFiles.length}/{MAX_MEDIA_FILES}
                        </span>
                      </div>
                      {entryParam === 'ugc_upload' ? (
                        <p className="text-xs text-muted-foreground">
                          Add photos from your gallery. We keep successful uploads even if some files fail.
                        </p>
                      ) : null}
                      <input
                        ref={mediaInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={handleMediaInputChange}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting || selectedMediaFiles.length >= MAX_MEDIA_FILES}
                          onClick={() => mediaInputRef.current?.click()}
                        >
                          Add photos
                        </Button>
                        <span className="text-xs text-muted-foreground">Max 5 images, 10MB each.</span>
                      </div>
                      {selectedMediaFiles.length ? (
                        <div className="space-y-2">
                          {selectedMediaFiles.map((file, idx) => (
                            <div
                              key={`${file.name}-${file.size}-${idx}`}
                              className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-xs"
                            >
                              <span className="truncate pr-2">{file.name}</span>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => removeMediaAt(idx)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <Button type="submit" variant="gradient" disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Submit review'}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Product not found.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
