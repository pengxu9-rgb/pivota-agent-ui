import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';
import {
  JsonLdScript,
  PivotaProductSeoSummary,
  buildOfferJsonLd,
  buildPivotaProductMetadata,
  buildProductJsonLd,
  canonicalProductEntityIdForRouteAsync,
  getPivotaProductSeoData,
} from './pdpSeo';

type Props = {
  params: Promise<{ id: string }>;
};

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getPivotaProductSeoData(id);
  return buildPivotaProductMetadata(data);
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const canonicalId = await canonicalProductEntityIdForRouteAsync(id);
  if (canonicalId && canonicalId !== id) {
    permanentRedirect(`/products/${encodeURIComponent(canonicalId)}`);
  }
  const data = await getPivotaProductSeoData(id);

  return (
    <>
      <JsonLdScript id="pivota-product-jsonld" data={buildProductJsonLd(data)} />
      <JsonLdScript id="pivota-offer-jsonld" data={buildOfferJsonLd(data)} />
      <ProductDetailClient id={id} />
      <PivotaProductSeoSummary data={data} />
    </>
  );
}
