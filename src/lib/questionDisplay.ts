export type QuestionDisplaySurface = 'pdp' | 'landing';

export interface QuestionDisplayExcerpt {
  question: string;
  answer?: string;
  question_truncated?: boolean;
  answer_truncated?: boolean;
}

export interface QuestionDisplayContract {
  pdp?: QuestionDisplayExcerpt;
  landing?: QuestionDisplayExcerpt;
}

type QuestionDisplayLike = {
  question?: string | null;
  answer?: string | null;
  display?: QuestionDisplayContract | null;
};

const QUESTION_DISPLAY_LIMITS: Record<QuestionDisplaySurface, { question: number; answer: number }> = {
  pdp: {
    question: 110,
    answer: 220,
  },
  landing: {
    question: 180,
    answer: 420,
  },
};

function normalizeWhitespace(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(value: string): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?。！？]+[.!?。！？]*/g) || [];
  return parts.map((part) => normalizeWhitespace(part)).filter(Boolean);
}

function truncateAtBoundary(value: string, maxChars: number): { text: string; truncated: boolean } {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }
  const slice = normalized.slice(0, maxChars + 1);
  const boundary = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('; '),
    slice.lastIndexOf(': '),
    slice.lastIndexOf(', '),
    slice.lastIndexOf(' '),
  );
  const clipped = normalizeWhitespace(slice.slice(0, boundary > 24 ? boundary : maxChars));
  return { text: `${clipped}…`, truncated: true };
}

function buildQuestionExcerpt(value: string, maxChars: number): { text: string; truncated: boolean } {
  return truncateAtBoundary(value, maxChars);
}

function buildAnswerExcerpt(value: string, maxChars: number): { text: string; truncated: boolean } {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }

  const sentences = splitSentences(normalized);
  if (sentences.length > 1) {
    const picked: string[] = [];
    let used = 0;
    for (const sentence of sentences) {
      const next = picked.length ? `${picked.join(' ')} ${sentence}` : sentence;
      if (next.length > maxChars) break;
      picked.push(sentence);
      used = next.length;
    }
    if (picked.length > 0) {
      return {
        text: `${picked.join(' ')}…`,
        truncated: used < normalized.length,
      };
    }
  }

  return truncateAtBoundary(normalized, maxChars);
}

function fallbackDisplay(item: QuestionDisplayLike, surface: QuestionDisplaySurface): QuestionDisplayExcerpt {
  const limits = QUESTION_DISPLAY_LIMITS[surface];
  const questionFull = normalizeWhitespace(item.question);
  const answerFull = normalizeWhitespace(item.answer);
  const question = buildQuestionExcerpt(questionFull, limits.question);
  const answer = answerFull ? buildAnswerExcerpt(answerFull, limits.answer) : { text: '', truncated: false };

  return {
    question: question.text,
    ...(answer.text ? { answer: answer.text } : {}),
    ...(question.truncated ? { question_truncated: true } : {}),
    ...(answer.truncated ? { answer_truncated: true } : {}),
  };
}

export function resolveQuestionDisplay(
  item: QuestionDisplayLike,
  surface: QuestionDisplaySurface,
): QuestionDisplayExcerpt {
  const contract = item?.display?.[surface];
  if (contract?.question) {
    return {
      question: normalizeWhitespace(contract.question),
      ...(contract.answer ? { answer: normalizeWhitespace(contract.answer) } : {}),
      ...(contract.question_truncated ? { question_truncated: true } : {}),
      ...(contract.answer_truncated ? { answer_truncated: true } : {}),
    };
  }
  return fallbackDisplay(item, surface);
}

export function isQuestionDisplayTruncated(
  item: QuestionDisplayLike,
  surface: QuestionDisplaySurface,
): boolean {
  const resolved = resolveQuestionDisplay(item, surface);
  return Boolean(resolved.question_truncated || resolved.answer_truncated);
}
