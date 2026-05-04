const PUBLIC_BASE_URL = 'https://agent.pivota.cc';

function normalizeProductEntityId(value: unknown) {
  const id = String(value || '').trim();
  return /^sig_[a-z0-9]+$/i.test(id) ? id : '';
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const providedUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  const productEntityId = normalizeProductEntityId(body?.product_entity_id);
  const url =
    productEntityId && !providedUrl
      ? `${PUBLIC_BASE_URL}/products/${productEntityId}`
      : providedUrl;

  if (!/^https:\/\/agent\.pivota\.cc\/products\/sig_[a-z0-9]+$/i.test(url)) {
    return Response.json(
      { error: 'Provide a canonical Pivota ProductEntity URL or product_entity_id' },
      { status: 400 },
    );
  }

  // Google indexing cannot be automated via API.
  // This endpoint only prepares the URL for manual submission.
  return Response.json({
    message: 'Use Google Search Console URL Inspection to request indexing',
    url,
  });
}
