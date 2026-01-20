'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getProductDetail, type ProductResponse } from '@/lib/api';
import { cn } from '@/lib/utils';

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

type OrderSummaryItem = {
  platform_product_id?: string;
  variant_id?: string;
  title?: string;
  variant_title?: string;
  quantity?: number;
  image_url?: string;
};

type OrderSummary = {
  order_id?: string;
  order_number?: string;
  platform_order_id?: string;
  status?: string;
  payment_status?: string;
  created_at?: string;
  paid_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  currency?: string;
  total_price?: number | string;
  merchant?: {
    name?: string;
    domain?: string;
    platform?: string;
  };
  items?: OrderSummaryItem[];
};

type MediaItem = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_MEDIA_FILES = 5;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

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

function subjectKey(subject: TokenSubject): string {
  return `${subject.platform_product_id || ''}::${subject.variant_id || ''}`;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function mediaIdForFile(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
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

export default function WriteReviewPage() {
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [submissionToken, setSubmissionToken] = useState<string | null>(null);
  const [submissionPayload, setSubmissionPayload] = useState<SubmissionTokenPayload | null>(null);
  const [selectedSubjectIdx, setSelectedSubjectIdx] = useState(0);
  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const mediaItemsRef = useRef<MediaItem[]>([]);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const subjects = useMemo(() => submissionPayload?.subjects || [], [submissionPayload]);
  const activeSubject = subjects[selectedSubjectIdx] || null;
  const orderItems = useMemo(() => orderSummary?.items || [], [orderSummary]);
  const orderItemMap = useMemo(() => {
    const map = new Map<string, OrderSummaryItem>();
    for (const item of orderItems) {
      const key = `${item.platform_product_id || ''}::${item.variant_id || ''}`;
      map.set(key, item);
    }
    return map;
  }, [orderItems]);
  const activeOrderItem = activeSubject
    ? orderItemMap.get(subjectKey(activeSubject)) || orderItemMap.get(`${activeSubject.platform_product_id}::`)
    : null;

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  useEffect(() => {
    return () => {
      mediaItemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get('order_id') || '').trim();
    const fromSession = (window.sessionStorage.getItem('pivota_reviews_order_id') || '').trim();
    const id = (fromQuery || fromSession || '').trim() || null;
    if (fromQuery) {
      window.sessionStorage.setItem('pivota_reviews_order_id', fromQuery);
    }
    setOrderId(id);
  }, []);

  useEffect(() => {
    const fromHash = parseInvitationTokenFromHash(window.location.hash);
    const fromSession = window.sessionStorage.getItem('pivota_reviews_invitation_token');
    const token = (fromHash || fromSession || '').trim() || null;

    if (fromHash) {
      window.sessionStorage.setItem('pivota_reviews_invitation_token', fromHash);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    setInvitationToken(token);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!invitationToken) {
        setLoading(false);
        return;
      }

      const cachedToken = window.sessionStorage.getItem('pivota_reviews_submission_token');
      if (cachedToken) {
        const payload = decodeSubmissionToken(cachedToken);
        if (payload?.merchant_id && Array.isArray(payload.subjects) && payload.subjects.length) {
          setSubmissionToken(cachedToken);
          setSubmissionPayload(payload);
          const cachedSummary = window.sessionStorage.getItem('pivota_reviews_order_summary');
          if (cachedSummary) {
            try {
              const parsed = JSON.parse(cachedSummary) as OrderSummary;
              if (!orderId || parsed?.order_id === orderId) {
                setOrderSummary(parsed);
              }
            } catch {
              // ignore
            }
          }
          setLoading(false);
          return;
        }
      }

      try {
        const res = await fetch('/api/reviews/buyer/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: invitationToken,
            ttl_seconds: 3600,
            order_id: orderId || undefined,
          }),
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
          if (data?.order_summary && typeof data.order_summary === 'object') {
            setOrderSummary(data.order_summary as OrderSummary);
            try {
              window.sessionStorage.setItem('pivota_reviews_order_summary', JSON.stringify(data.order_summary));
            } catch {
              // ignore
            }
          }
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
  }, [invitationToken, orderId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      if (!activeSubject) {
        setProduct(null);
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
  }, [activeSubject]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submissionToken || !submissionPayload?.merchant_id || !activeSubject) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      const idempotencyKey = `${submissionPayload.jti || 'jti'}:${activeSubject.platform}:${activeSubject.platform_product_id}:${activeSubject.variant_id || ''}`.slice(
        0,
        180,
      );

      const res = await fetch('/api/reviews/buyer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_token: submissionToken,
          idempotency_key: idempotencyKey,
          merchant_id: activeSubject.merchant_id,
          platform: activeSubject.platform,
          platform_product_id: activeSubject.platform_product_id,
          variant_id: activeSubject.variant_id || null,
          rating,
          title: title.trim() || null,
          body: body.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data?.detail || data?.error || data?.message || 'Submit failed') as string;
        throw new Error(detail);
      }

      const rid = Number(data?.review_id);
      if (Number.isFinite(rid)) setReviewId(rid);
      toast.success('Review submitted');
      if (Number.isFinite(rid) && mediaItems.length) {
        await uploadMedia(rid);
      }
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const primaryImage =
    activeOrderItem?.image_url || product?.image_url || orderItems[0]?.image_url || null;
  const merchantLabel = orderSummary?.merchant?.name || orderSummary?.merchant?.domain || '';
  const headline = merchantLabel || activeOrderItem?.title || product?.title || 'Product';
  const subline = merchantLabel ? activeOrderItem?.title || product?.title || null : null;
  const orderIdLabel = orderSummary?.order_number
    ? `Order #${orderSummary.order_number}`
    : orderSummary?.order_id
      ? `Order ID ${orderSummary.order_id}`
      : null;
  const orderDateLabel = formatDate(orderSummary?.created_at);
  const orderStatusLabel = [orderSummary?.status, orderSummary?.payment_status].filter(Boolean).join(' · ');
  const orderTotalLabel =
    orderSummary?.total_price != null
      ? `${orderSummary?.currency ? `${orderSummary.currency} ` : ''}${orderSummary.total_price}`
      : null;

  const addMediaFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    if (!incoming.length) return;
    setMediaError(null);

    const next = [...mediaItems];
    const errors: string[] = [];

    for (const file of incoming) {
      if (next.length >= MAX_MEDIA_FILES) {
        errors.push(`Up to ${MAX_MEDIA_FILES} photos per review.`);
        break;
      }
      if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
        errors.push('Only JPG, PNG, WEBP, or GIF images are supported.');
        continue;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        errors.push(`Each photo must be under ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)}MB.`);
        continue;
      }
      const id = mediaIdForFile(file);
      if (next.some((item) => item.id === id)) continue;
      const previewUrl = URL.createObjectURL(file);
      next.push({ id, file, previewUrl });
    }

    if (errors.length) setMediaError(errors[0]);
    setMediaItems(next);
  };

  const removeMediaItem = (id: string) => {
    setMediaItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const uploadMedia = async (rid: number) => {
    if (!submissionToken || mediaItems.length === 0) return;
    setMediaUploading(true);
    setMediaProgress({ done: 0, total: mediaItems.length, failed: 0 });
    let done = 0;
    let failed = 0;

    for (const item of mediaItems) {
      try {
        const form = new FormData();
        form.append('submission_token', submissionToken);
        form.append('review_id', String(rid));
        form.append('file', item.file);
        const res = await fetch('/api/reviews/buyer/media', {
          method: 'POST',
          body: form,
        });
        if (!res.ok) throw new Error('upload failed');
      } catch {
        failed += 1;
      } finally {
        done += 1;
        setMediaProgress({ done, total: mediaItems.length, failed });
      }
    }

    setMediaUploading(false);
    if (failed > 0) {
      toast.error(`${failed} photo${failed > 1 ? 's' : ''} failed to upload. You can retry later.`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-6 md:p-8 space-y-6 border border-border">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Write a review</h1>
          <p className="text-sm text-muted-foreground">Your feedback helps other buyers and the merchant improve.</p>
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading...</div>}

        {!loading && !invitationToken && (
          <div className="text-sm text-muted-foreground">
            Missing invitation token. Please open the link from your invitation email.
          </div>
        )}

        {!loading && invitationToken && !submissionToken && (
          <div className="text-sm text-muted-foreground">
            This invitation cannot be used. It may have expired or was already used.
          </div>
        )}

        {!loading && submissionToken && (
          <>
            {(subjects.length > 1 || orderItems.length > 1) && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">
                  {orderItems.length ? 'Order items' : 'Select item'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {subjects.map((s, idx) => {
                    const item =
                      orderItemMap.get(subjectKey(s)) || orderItemMap.get(`${s.platform_product_id}::`) || null;
                    const titleText =
                      item?.title || (product && idx === selectedSubjectIdx ? product.title : '') || `Product ${idx + 1}`;
                    const metaBits = [
                      item?.variant_title ? item.variant_title : null,
                      item?.quantity != null ? `x${item.quantity}` : null,
                      `${s.platform} · ${s.platform_product_id}`,
                    ].filter(Boolean);
                    return (
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
                      <div className="text-sm font-semibold text-foreground line-clamp-1">{titleText}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{metaBits.join(' · ')}</div>
                    </button>
                  );
                })}
                </div>
              </div>
            )}

            {activeSubject && (
              <div className="rounded-2xl border border-border bg-white/50 p-4 space-y-3">
                <div className="flex gap-4 items-center">
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-black/5 shrink-0">
                    {primaryImage ? (
                      <Image src={primaryImage} alt={headline} fill className="object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Order</div>
                    <div className="font-semibold text-foreground line-clamp-1">{headline}</div>
                    {subline ? <div className="text-sm text-foreground line-clamp-1">{subline}</div> : null}
                    {orderIdLabel ? (
                      <div className="text-xs text-muted-foreground">{orderIdLabel}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {activeSubject.platform} · {activeSubject.platform_product_id}
                      </div>
                    )}
                    {orderDateLabel ? (
                      <div className="text-xs text-muted-foreground">Placed {orderDateLabel}</div>
                    ) : null}
                    {orderStatusLabel ? (
                      <div className="text-xs text-muted-foreground">{orderStatusLabel}</div>
                    ) : null}
                  </div>
                </div>
                {(activeOrderItem?.quantity != null || activeOrderItem?.variant_title || orderTotalLabel) && (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {activeOrderItem?.variant_title ? (
                      <span className="rounded-full bg-black/5 px-2 py-0.5">{activeOrderItem.variant_title}</span>
                    ) : null}
                    {activeOrderItem?.quantity != null ? (
                      <span className="rounded-full bg-black/5 px-2 py-0.5">Qty {activeOrderItem.quantity}</span>
                    ) : null}
                    {orderTotalLabel ? (
                      <span className="rounded-full bg-black/5 px-2 py-0.5">Total {orderTotalLabel}</span>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {reviewId != null ? (
              <div className="rounded-2xl border border-border bg-white/50 p-4 text-sm">
                <div className="font-semibold text-foreground">Thanks!</div>
                <div className="text-muted-foreground mt-1">
                  Review received (ID: {reviewId}). It may appear after moderation.
                </div>
                {mediaProgress ? (
                  <div className="text-xs text-muted-foreground mt-2">
                    {mediaUploading
                      ? `Uploading photos… ${mediaProgress.done}/${mediaProgress.total}`
                      : mediaProgress.failed > 0
                        ? `Uploaded ${mediaProgress.total - mediaProgress.failed}/${mediaProgress.total} photos.`
                        : `Uploaded ${mediaProgress.total}/${mediaProgress.total} photos.`}
                  </div>
                ) : null}
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      window.sessionStorage.removeItem('pivota_reviews_invitation_token');
                      window.sessionStorage.removeItem('pivota_reviews_submission_token');
                      window.sessionStorage.removeItem('pivota_reviews_order_summary');
                      window.sessionStorage.removeItem('pivota_reviews_order_id');
                      mediaItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
                      setMediaItems([]);
                      setMediaError(null);
                      setMediaProgress(null);
                      setMediaUploading(false);
                      window.location.reload();
                    }}
                  >
                    Submit another (new link)
                  </Button>
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

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">Add photos (optional)</div>
                      <div className="text-xs text-muted-foreground">
                        Photos make reviews more helpful and trusted.
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {mediaItems.length}/{MAX_MEDIA_FILES}
                    </div>
                  </div>

                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-white/50 px-4 py-6 text-sm text-muted-foreground cursor-pointer hover:bg-white/70 transition-colors">
                    <span className="font-medium text-foreground">Upload photos</span>
                    <span className="text-xs">JPG, PNG, WEBP, GIF · up to 10MB each</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        addMediaFiles(e.target.files);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>

                  {mediaError ? <div className="text-xs text-destructive">{mediaError}</div> : null}

                  {mediaItems.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {mediaItems.map((item) => (
                        <div key={item.id} className="relative rounded-lg overflow-hidden border border-border bg-white">
                          <img src={item.previewUrl} alt={item.file.name} className="h-20 w-full object-cover" />
                          <button
                            type="button"
                            className="absolute top-1 right-1 rounded-full bg-white/90 text-xs px-2 py-0.5 border border-border"
                            onClick={() => removeMediaItem(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
      </div>
    </div>
  );
}
