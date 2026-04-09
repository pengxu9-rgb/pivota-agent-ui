function formatSourceLabel(sourceOrigin?: string, sourceQualityStatus?: string): string | null {
  if (sourceOrigin === 'retail_pdp') return 'Retail PDP';
  if (sourceOrigin === 'reviewed_kb') return 'Reviewed KB';
  if (sourceOrigin === 'structured_seed') return 'Structured Seed';
  if (sourceQualityStatus === 'parsed') return 'Parsed PDP';
  if (sourceQualityStatus === 'derived') return 'Fallback';
  return null;
}

export function PdpSourceBadge({
  sourceOrigin,
  sourceQualityStatus,
}: {
  sourceOrigin?: string;
  sourceQualityStatus?: string;
}) {
  const label = formatSourceLabel(sourceOrigin, sourceQualityStatus);
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}
