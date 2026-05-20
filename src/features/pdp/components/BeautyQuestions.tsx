'use client';

import { resolveQuestionDisplay, type QuestionDisplayContract } from '@/lib/questionDisplay';
import { cn } from '@/lib/utils';

/**
 * Questions section for the Beauty mobile PDP.
 *
 * The redesign/pivota-pdp.jsx source of truth had no Q&A section, so this
 * is built in the Beauty visual language (eyebrow header + horizontal
 * scroll cards) rather than translated from the design. It carries the
 * same data + handler contract as the legacy BeautyReviewsSection Q&A
 * block: merged questions, "Ask a question", per-question open, "View all".
 */

export type BeautyQuestion = {
  question_id?: number;
  question: string;
  answer?: string;
  replies?: number;
  source?: string;
  source_label?: string;
  support_count?: number;
  display?: QuestionDisplayContract | null;
};

export function BeautyQuestions({
  questions,
  onAsk,
  onSeeAll,
  onOpen,
  canAsk = true,
  askLabel = 'Ask a question',
  seeAllLabel = 'View all',
}: {
  questions: BeautyQuestion[];
  onAsk?: () => void;
  onSeeAll?: () => void;
  onOpen?: (questionId: number) => void;
  canAsk?: boolean;
  askLabel?: string;
  seeAllLabel?: string;
}) {
  const list = questions ?? [];
  // Render the section even with no questions yet (the "ask" affordance
  // still matters) — only drop it entirely when there is nothing to show
  // and no way to ask.
  if (!list.length && !onAsk) return null;

  return (
    <section className="mt-3.5">
      <div className="mb-2.5 flex items-center justify-between px-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {list.length ? `Questions (${list.length})` : 'Questions'}
        </span>
        {onAsk ? (
          <button
            type="button"
            onClick={onAsk}
            aria-disabled={!canAsk}
            className={cn(
              'text-[12px] font-medium text-cd-primary',
              canAsk ? '' : 'cursor-not-allowed opacity-50',
            )}
          >
            {askLabel} →
          </button>
        ) : null}
      </div>

      <div className="flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!list.length ? (
          <div className="min-w-[230px] flex-shrink-0 rounded-[10px] border border-dashed border-border bg-white p-3 text-[12px] text-muted-foreground">
            No questions yet. Be the first to ask.
          </div>
        ) : null}
        {list.map((q, idx) => {
          const display = resolveQuestionDisplay(q, 'pdp');
          const showReplyCount = q.source === 'community' && q.replies != null;
          const body = (
            <>
              <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-foreground">
                {display.question}
              </p>
              {display.answer ? (
                <p className="mt-1.5 line-clamp-4 text-[12px] leading-relaxed text-muted-foreground">
                  {display.answer}
                </p>
              ) : null}
              {q.source_label ? (
                <p className="mt-2 text-[11px] font-medium text-muted-foreground">{q.source_label}</p>
              ) : null}
              {q.support_count != null ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Supported by {q.support_count} reviews
                </p>
              ) : null}
              {showReplyCount ? (
                <p className="mt-2 text-[11px] text-muted-foreground">{q.replies} replies</p>
              ) : null}
            </>
          );

          if (onOpen && q.question_id) {
            return (
              <button
                key={`${q.question}-${idx}`}
                type="button"
                onClick={() => onOpen(Number(q.question_id))}
                className="min-w-[230px] max-w-[260px] flex-shrink-0 rounded-[10px] border border-border bg-white p-3 text-left"
              >
                {body}
              </button>
            );
          }

          return (
            <div
              key={`${q.question}-${idx}`}
              className="min-w-[230px] max-w-[260px] flex-shrink-0 rounded-[10px] border border-border bg-white p-3"
            >
              {body}
            </div>
          );
        })}
        {onSeeAll && list.length ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex min-w-[110px] flex-shrink-0 items-center justify-center rounded-[10px] border border-dashed border-border p-3 text-[12px] font-medium text-muted-foreground"
          >
            {seeAllLabel} →
          </button>
        ) : null}
      </div>
    </section>
  );
}
