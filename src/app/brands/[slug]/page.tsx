import { BrandLandingPage } from './BrandLandingPage';

function readSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <BrandLandingPage
      slug={resolvedParams.slug}
      initialBrandName={readSearchParam(resolvedSearchParams.name)}
      initialSubtitle={readSearchParam(resolvedSearchParams.subtitle)}
      initialReturnUrl={readSearchParam(resolvedSearchParams.return)}
      initialSourceProductId={readSearchParam(resolvedSearchParams.source_product_id)}
      initialSourceMerchantId={readSearchParam(resolvedSearchParams.source_merchant_id)}
      initialQuery={readSearchParam(resolvedSearchParams.q)}
    />
  );
}
