'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getPdpV2, listQuestions, postQuestion, type QuestionListItem } from '@/lib/api';
import { buildProductHref } from '@/lib/productHref';
import {
  isQuestionDisplayTruncated,
  resolveQuestionDisplay,
  type QuestionDisplayContract,
} from '@/lib/questionDisplay';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { ReviewsPreviewData } from '@/features/pdp/types';

type QuestionDisplayItem = QuestionListItem & {
  display?: QuestionDisplayContract;
  synthetic_key?: string;
};

function normalizeQuestionKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[?？]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sourceLabelFor(source: unknown): string | undefined {
  const key = String(source || '').trim().toLowerCase();
  if (key === 'merchant_faq') return 'Official FAQ';
  if (key === 'review_derived') return 'From reviews';
  if (key === 'community') return 'Community';
  return undefined;
}

function normalizeReplyCount(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function shouldCarryReplyCount(item: { source?: unknown; question_id?: unknown; answer?: unknown }): boolean {
  const source = String(item.source || '').trim().toLowerCase();
  if (source === 'merchant_faq' || source === 'review_derived') return false;
  return Number(item.question_id) > 0 || source === 'community';
}

function mergeReplyCounts(a: unknown, b: unknown): number | undefined {
  const left = normalizeReplyCount(a);
  const right = normalizeReplyCount(b);
  if (left == null) return right;
  if (right == null) return left;
  return Math.max(left, right);
}

function shouldShowReplyCount(item: QuestionDisplayItem): boolean {
  return shouldCarryReplyCount(item) && normalizeReplyCount(item.replies) != null;
}

function mergeQuestionItems(...groups: Array<QuestionDisplayItem[] | null | undefined>): QuestionDisplayItem[] {
  const merged = new Map<string, QuestionDisplayItem>();

  const upsert = (item: QuestionDisplayItem) => {
    const question = String(item?.question || '').trim();
    const key = normalizeQuestionKey(question);
    if (!question || !key) return;
    const qid = Number(item.question_id) || 0;
    const existing = merged.get(key);
    const replies = shouldCarryReplyCount(item) ? normalizeReplyCount(item.replies) : undefined;
    const normalized: QuestionDisplayItem = {
      ...item,
      question_id: qid,
      question,
      ...(replies != null ? { replies } : { replies: undefined }),
      ...(item.source && !item.source_label ? { source_label: sourceLabelFor(item.source) } : {}),
      synthetic_key: item.synthetic_key || `${item.source || 'question'}:${key}`,
    };

    if (!existing) {
      merged.set(key, normalized);
      return;
    }

    const preserveCommunityThreadSource = Boolean(existing.question_id) && existing.source === 'community';
    merged.set(key, {
      ...existing,
      ...(existing.question_id ? {} : { question_id: qid }),
      ...(existing.answer ? {} : normalized.answer ? { answer: normalized.answer } : {}),
      replies: mergeReplyCounts(existing.replies, normalized.replies),
      ...(existing.display ? {} : normalized.display ? { display: normalized.display } : {}),
      ...(preserveCommunityThreadSource || (existing.source && existing.source !== 'community')
        ? {}
        : normalized.source
          ? { source: normalized.source }
          : {}),
      ...(existing.source_label ? {} : normalized.source_label ? { source_label: normalized.source_label } : {}),
      support_count: Math.max(Number(existing.support_count) || 0, Number(normalized.support_count) || 0) || undefined,
    });
  };

  for (const group of groups) {
    for (const item of group || []) upsert(item);
  }

  return Array.from(merged.values());
}

function normalizeReviewQuestions(reviews: ReviewsPreviewData | null): QuestionDisplayItem[] {
  const questions = Array.isArray((reviews as any)?.questions) ? (reviews as any).questions : [];
  return questions
    .map((item: any, index: number) => {
      const question = String(item?.question || '').trim();
      if (!question) return null;
      const source = item?.source ? String(item.source) : undefined;
      const questionId = Number(item?.question_id ?? item?.questionId ?? item?.id) || 0;
      const replies =
        shouldCarryReplyCount({ source, question_id: questionId, answer: item?.answer })
          ? normalizeReplyCount(item?.replies ?? item?.reply_count ?? item?.replyCount)
          : undefined;
      return {
        question_id: questionId,
        question,
        ...(item?.answer ? { answer: String(item.answer).trim() } : {}),
        ...(replies != null ? { replies } : {}),
        ...(source ? { source } : {}),
        source_label: item?.source_label ? String(item.source_label) : sourceLabelFor(source),
        ...(Number.isFinite(Number(item?.support_count ?? item?.supportCount))
          ? { support_count: Number(item?.support_count ?? item?.supportCount) }
          : {}),
        ...(item?.display && typeof item.display === 'object'
          ? { display: item.display as QuestionDisplayContract }
          : {}),
        synthetic_key: `${source || 'reviews_preview'}:${normalizeQuestionKey(question)}:${index}`,
      } satisfies QuestionDisplayItem;
    })
    .filter(Boolean) as QuestionDisplayItem[];
}

function extractReviewsPreviewQuestions(response: Awaited<ReturnType<typeof getPdpV2>>): QuestionDisplayItem[] {
  const directModule = Array.isArray(response?.modules)
    ? response.modules.find((module: any) => module?.type === 'reviews_preview')
    : null;
  const directReviews = directModule?.data && typeof directModule.data === 'object'
    ? (directModule.data as ReviewsPreviewData)
    : null;
  const directQuestions = normalizeReviewQuestions(directReviews);
  if (directQuestions.length) return directQuestions;

  const mappedPayload = mapPdpV2ToPdpPayload(response);
  const mappedReviews = mappedPayload?.modules.find((module) => module.type === 'reviews_preview')?.data as
    | ReviewsPreviewData
    | undefined;
  return normalizeReviewQuestions(mappedReviews || null);
}

export default function QuestionsListClient() {
  const router = useRouter();
  const params = useSearchParams();

  const productId = (params.get('product_id') || params.get('productId') || '').trim();
  const productGroupId = (params.get('product_group_id') || params.get('productGroupId') || '').trim() || null;
  const merchantId = (params.get('merchant_id') || params.get('merchantId') || '').trim() || null;

  const [items, setItems] = useState<QuestionDisplayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const [communityResult, pdpQuestionResult] = await Promise.allSettled([
          listQuestions({
            productId,
            ...(productGroupId ? { productGroupId } : {}),
            limit: 50,
          }),
          getPdpV2({
            product_id: productId,
            ...(merchantId ? { merchant_id: merchantId } : {}),
            include: ['reviews_preview'],
            timeout_ms: 7000,
          }).then(extractReviewsPreviewQuestions),
        ]);
        if (cancelled) return;
        if (communityResult.status === 'rejected' && pdpQuestionResult.status === 'rejected') {
          throw communityResult.reason || pdpQuestionResult.reason;
        }
        const communityItems =
          communityResult.status === 'fulfilled'
            ? (communityResult.value?.items || []).map((item) => ({
                ...item,
                source: item.source || 'community',
                source_label: item.source_label || 'Community',
              }))
            : [];
        const pdpQuestions = pdpQuestionResult.status === 'fulfilled' ? pdpQuestionResult.value : [];
        setItems(mergeQuestionItems(communityItems, pdpQuestions));
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Failed to load questions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [merchantId, productGroupId, productId]);

  const requireLogin = (intent: 'question' | 'reply') => {
    const redirect =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/community/questions';
    toast.message(intent === 'reply' ? 'Please log in to reply.' : 'Please log in to ask a question.');
    router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
  };

  const submitQuestion = async () => {
    const text = askText.trim();
    if (!text) {
      toast.message('Please enter a question.');
      return;
    }
    if (!productId || submitting) return;

    setSubmitting(true);
    try {
      const res = await postQuestion({
        productId,
        ...(productGroupId ? { productGroupId } : {}),
        question: text,
      });
      const qid = Number((res as any)?.question_id ?? (res as any)?.questionId ?? (res as any)?.id) || Date.now();
      setItems((prev) => [
        {
          question_id: qid,
          question: text,
          created_at: new Date().toISOString(),
          replies: 0,
          source: 'community',
          source_label: 'Community',
        },
        ...(prev || []),
      ]);
      setAskText('');
      setAskOpen(false);
      toast.success('Question submitted.');
    } catch (e: any) {
      if (e?.status === 401 || e?.code === 'NOT_AUTHENTICATED') {
        requireLogin('question');
        return;
      }
      toast.error(e?.message || 'Failed to submit question.');
    } finally {
      setSubmitting(false);
    }
  };

  const backToPdpHref = productId ? buildProductHref(productId, merchantId) : '/products';

  return (
    <div className="min-h-screen bg-gradient-mesh px-4 py-10 pb-[calc(96px+env(safe-area-inset-bottom,0px))]">
      <div className="max-w-2xl mx-auto space-y-6">
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
              <h1 className="text-xl font-semibold">Questions</h1>
              <p className="text-xs text-muted-foreground">Questions and answers from the product page and community.</p>
            </div>
          </div>

          <Button size="sm" className="rounded-full" onClick={() => setAskOpen(true)} disabled={!productId}>
            Ask a question
          </Button>
        </div>

        {!productId ? (
          <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm text-muted-foreground">
            Missing product context. Open this page from a PDP “Questions” section.
          </div>
        ) : null}

        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

        {productId && !loading ? (
          <div className="space-y-3">
            {items.length ? (
              items.map((q) => {
                const canOpenThread = Number(q.question_id) > 0 && (!q.source || q.source === 'community');
                const key = q.synthetic_key || String(q.question_id || normalizeQuestionKey(q.question));
                const expanded = expandedKeys.has(key);
                const preview = resolveQuestionDisplay(q, 'landing');
                const showReplyCount = shouldShowReplyCount(q);
                const expandable = !canOpenThread && isQuestionDisplayTruncated(q, 'landing');
                const questionText = expanded ? q.question : preview.question;
                const answerText = expanded ? q.answer : preview.answer;
                const content = (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold leading-snug">{questionText}</div>
                      {answerText ? (
                        <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{answerText}</div>
                      ) : null}
                      {q.source_label ? (
                        <div className="mt-2 text-[11px] font-medium text-muted-foreground">{q.source_label}</div>
                      ) : null}
                      {q.support_count ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Supported by {q.support_count} reviews
                        </div>
                      ) : null}
                      {showReplyCount ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {q.replies === 1 ? '1 reply' : `${q.replies} replies`}
                        </div>
                      ) : null}
                      {expandable ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-primary hover:underline"
                          onClick={(event) => {
                            event.preventDefault();
                            setExpandedKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                        >
                          {expanded ? 'Show less' : 'Read more'}
                        </button>
                      ) : null}
                    </div>
                    {canOpenThread ? <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5" /> : null}
                  </div>
                );

                return canOpenThread ? (
                  <Link
                    key={key}
                    href={`/community/questions/${q.question_id}?${params.toString()}`}
                    className="block rounded-2xl border border-border bg-white/70 p-4 hover:border-primary/50"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={key} className="block rounded-2xl border border-border bg-white/70 p-4">
                    {content}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-white/70 p-6 text-sm text-muted-foreground">
                No questions yet. Be the first to ask!
              </div>
            )}
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          <Link href={backToPdpHref} className="hover:underline">
            Back to product
          </Link>
        </div>
      </div>

      {askOpen ? (
        <div className="fixed inset-0 z-[2147483647] flex items-end justify-center bg-black/40 px-3 py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Ask a question</h3>
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-border text-muted-foreground"
                onClick={() => {
                  if (!submitting) setAskOpen(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Ask about sizing, materials, shipping, or anything else.</p>
            <textarea
              className="mt-3 w-full min-h-[120px] rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="Type your question…"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              disabled={submitting}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                disabled={submitting}
                onClick={() => setAskOpen(false)}
              >
                Cancel
              </Button>
              <Button className="flex-1 rounded-xl" disabled={submitting} onClick={submitQuestion}>
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
