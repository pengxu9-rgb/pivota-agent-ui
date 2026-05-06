import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import IndexabilityListing, {
  buildIndexabilityMetadata,
} from '../../IndexabilityListing';
import { INDEXABILITY_HARD_PAGE_LIMIT } from '../../productsIndexability';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ n: string }>;
}

function parsePage(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n > INDEXABILITY_HARD_PAGE_LIMIT) return null;
  return n;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { n } = await params;
  const page = parsePage(n) ?? 1;
  return buildIndexabilityMetadata(page);
}

export default async function IndexabilityPagePage({ params }: PageProps) {
  const { n } = await params;
  const page = parsePage(n);
  if (page === null || page === 1) {
    // Either malformed (e.g. /page/0, /page/abc) or the canonical
    // page 1 URL — both should 404 so crawlers don't index a duplicate
    // of `/products/indexability`.
    notFound();
  }
  return <IndexabilityListing page={page} />;
}
