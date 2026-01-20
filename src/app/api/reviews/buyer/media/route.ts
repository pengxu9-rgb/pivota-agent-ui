import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ACCOUNTS_BASE = 'https://web-production-fedb.up.railway.app/accounts';

function getReviewsUpstreamBase(): string {
  const explicit = (
    process.env.REVIEWS_UPSTREAM_BASE ||
    process.env.NEXT_PUBLIC_REVIEWS_UPSTREAM_BASE ||
    process.env.NEXT_PUBLIC_REVIEWS_BASE
  )?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const accounts = (process.env.NEXT_PUBLIC_ACCOUNTS_BASE || DEFAULT_ACCOUNTS_BASE)
    .trim()
    .replace(/\/$/, '');
  if (accounts.endsWith('/accounts')) return accounts.slice(0, -'/accounts'.length);
  return accounts;
}

async function parseUpstreamResponse(resp: Response) {
  const text = await resp.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const submissionToken = String(form.get('submission_token') || '').trim();
    const reviewId = String(form.get('review_id') || '').trim();
    const file = form.get('file');

    if (!submissionToken) return NextResponse.json({ error: 'Missing submission_token' }, { status: 400 });
    if (!reviewId) return NextResponse.json({ error: 'Missing review_id' }, { status: 400 });
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const upstreamBase = getReviewsUpstreamBase();
    const upstreamForm = new FormData();
    upstreamForm.append('file', file);

    const upstreamRes = await fetch(`${upstreamBase}/buyer/reviews/v1/reviews/${reviewId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${submissionToken}`,
      },
      cache: 'no-store',
      body: upstreamForm,
    });

    const data = await parseUpstreamResponse(upstreamRes);
    return NextResponse.json(data, {
      status: upstreamRes.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[reviews media] proxy error:', error);
    return NextResponse.json(
      { error: 'Gateway proxy error', message: (error as Error).message ?? String(error) },
      { status: 500 },
    );
  }
}
