'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getQuestion, listQuestionReplies, postQuestionReply, type QuestionReplyListItem } from '@/lib/api';

function formatDate(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function QuestionThreadClient() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const productId = (search.get('product_id') || search.get('productId') || '').trim();
  const merchantId = (search.get('merchant_id') || search.get('merchantId') || '').trim();

  const questionId = useMemo(() => {
    const raw = (params as any)?.questionId;
    return Number(Array.isArray(raw) ? raw[0] : raw);
  }, [params]);

  const backHref = useMemo(() => {
    const qs = search.toString();
    return `/community/questions${qs ? `?${qs}` : ''}`;
  }, [search]);

  const backToProductHref = useMemo(() => {
    if (!productId) return '';
    const base = `/products/${encodeURIComponent(productId)}`;
    return merchantId ? `${base}?merchant_id=${encodeURIComponent(merchantId)}` : base;
  }, [merchantId, productId]);

  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<{ question: string; created_at?: string | null; replies?: number } | null>(null);
  const [replies, setReplies] = useState<QuestionReplyListItem[]>([]);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(questionId) || questionId <= 0) {
      setLoading(false);
      setQuestion(null);
      return;
    }

    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const [q, r] = await Promise.all([
          getQuestion({ questionId }),
          listQuestionReplies({ questionId, limit: 50 }),
        ]);
        if (cancelled) return;
        setQuestion(q ? { question: q.question, created_at: q.created_at, replies: q.replies } : null);
        setReplies(r?.items || []);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Failed to load discussion');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  const requireLogin = () => {
    const redirect =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : backHref;
    toast.message('Please log in to reply.');
    router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
  };

  const onSubmitReply = async () => {
    const text = replyText.trim();
    if (!text) {
      toast.message('Please enter a reply.');
      return;
    }
    if (!Number.isFinite(questionId) || questionId <= 0) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await postQuestionReply({ questionId, body: text });
      const rid = Number((res as any)?.reply_id ?? (res as any)?.replyId ?? (res as any)?.id) || Date.now();
      setReplies((prev) => [{ reply_id: rid, body: text, created_at: new Date().toISOString() }, ...(prev || [])]);
      setReplyText('');
      setQuestion((prev) => (prev ? { ...prev, replies: (prev.replies || 0) + 1 } : prev));
    } catch (e: any) {
      if (e?.status === 401 || e?.code === 'NOT_AUTHENTICATED') {
        requireLogin();
        return;
      }
      toast.error(e?.message || 'Failed to submit reply');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-mesh px-4 py-10 pb-[calc(96px+env(safe-area-inset-bottom,0px))]">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-9 w-9 rounded-full border border-border bg-white/80 flex items-center justify-center"
              aria-label="Go back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="text-sm font-semibold">Discussion</div>
              <Link href={backHref} className="text-xs text-muted-foreground hover:underline">
                Back to all questions
              </Link>
            </div>
          </div>
          {backToProductHref ? (
            <Link href={backToProductHref} className="text-xs font-medium text-primary hover:underline">
              Back to product
            </Link>
          ) : null}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !question ? (
          <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm text-muted-foreground">
            Question not found.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-white/70 p-5">
              <div className="text-base font-semibold leading-snug">{question.question}</div>
              {question.created_at ? (
                <div className="mt-2 text-xs text-muted-foreground">{formatDate(question.created_at)}</div>
              ) : null}
            </div>

            <div className="space-y-3">
              {replies.length ? (
                replies.map((r) => (
                  <div key={String(r.reply_id)} className="rounded-2xl border border-border bg-white/70 p-4">
                    <div className="text-xs text-muted-foreground">Community member</div>
                    <div className="mt-2 text-sm leading-relaxed">{r.body}</div>
                    {r.created_at ? (
                      <div className="mt-2 text-[11px] text-muted-foreground">{formatDate(r.created_at)}</div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-white/70 p-6 text-sm text-muted-foreground">
                  No replies yet. Be the first to answer.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/90 backdrop-blur border-t border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-end gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply…"
            className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            disabled={submitting || !question}
          />
          <Button className="rounded-xl" onClick={onSubmitReply} disabled={submitting || !question}>
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
