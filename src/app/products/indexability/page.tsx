import type { Metadata } from 'next';
import IndexabilityListing, {
  buildIndexabilityMetadata,
} from './IndexabilityListing';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildIndexabilityMetadata(1);
}

export default async function IndexabilityRootPage() {
  return <IndexabilityListing page={1} />;
}
