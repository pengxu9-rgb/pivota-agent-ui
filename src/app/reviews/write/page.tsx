'use client';

import { useEffect, useMemo, useState } from 'react';
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

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const subjects = useMemo(() => submissionPayload?.subjects || [], [submissionPayload]);
  const activeSubject = subjects[selectedSubjectIdx] || null;

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
  }, [invitationToken]);

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
  }, [activeSubject?.merchant_id, activeSubject?.platform_product_id]);

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
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || 'Submit failed');
    } finally {
      setSubmitting(false);
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
            This invitation can't be used. It may have expired or was already used.
          </div>
        )}

        {!loading && submissionToken && (
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
