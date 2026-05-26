import ProviderDetailPage from './ProviderDetailPage';

export default async function ServiceProviderPage({ params }: { params: Promise<{ provider_id: string }> }) {
  const { provider_id } = await params;
  return <ProviderDetailPage providerId={provider_id} />;
}
