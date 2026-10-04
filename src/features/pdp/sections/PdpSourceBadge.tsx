import { publicEvidenceUrl, publicEvidenceTimestamp } from '../utils/publicEvidence';
/** Bounded public provenance, with no private collector/reviewer dossier. */
export function PdpSourceBadge({ sourceOrigin, sourceQualityStatus, sourceUrl, capturedAt }: {
  sourceOrigin?: string;
  sourceQualityStatus?: string;
  sourceUrl?: string;
  capturedAt?: string;
}) {
  if (!sourceOrigin && !sourceQualityStatus && !sourceUrl) return null;
  const labels: Record<string, string> = {
    pdp_section: 'Merchant product page', product_active_array: 'Product ingredient data',
    reviewed_source_backed_pdp_content_patch: 'Merchant product information',
    authoritative: 'Source-backed', high: 'Source-backed', low: 'Limited evidence',
    blocked: 'Evidence withheld', unverified: 'Unverified',
  };
  const origin = sourceOrigin ? labels[sourceOrigin] || 'Product information' : 'Product information';
  const quality = sourceQualityStatus ? labels[sourceQualityStatus] || 'Evidence quality unspecified' : 'Evidence quality unspecified';
  const safeUrl = publicEvidenceUrl(sourceUrl);
  const observed = publicEvidenceTimestamp(capturedAt)?.slice(0, 10);
  return <span className="text-[11px] text-muted-foreground">
    {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="underline">{origin}</a> : origin}
    {' · '}{quality}{observed ? ` · observed ${observed}` : ' · capture date unavailable'}
  </span>;
}
