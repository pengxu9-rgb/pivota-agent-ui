'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import type { ProductIntelData } from '@/features/pdp/types';

function normalizeWhitespace(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCase(value: string): string {
  const normalized = normalizeWhitespace(value).replace(/[_-]+/g, ' ');
  if (!normalized) return '';
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeNarrativeLead(value: unknown, evidenceProfile?: string): string {
  let text = normalizeWhitespace(value);
  if (!text) return '';
  if (String(evidenceProfile || '').trim().toLowerCase() === 'seller_only') {
    text = text.replace(/^our\s+/i, 'This ');
    text = text.replace(/^this product\s+/i, 'This ');
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeHighlightBody(value: unknown, evidenceProfile?: string): string {
  let text = normalizeNarrativeLead(value, evidenceProfile);
  if (!text) return '';
  if (String(evidenceProfile || '').trim().toLowerCase() === 'seller_only') {
    text = text
      .replace(/^Positions itself as\s+/i, '')
      .replace(/^Designed to\s+/i, '')
      .replace(/^This formula is designed to\s+/i, '')
      .replace(/^This serum is designed to\s+/i, '')
      .replace(/^Features?\s+/i, '')
      .replace(/^Delivers?\s+/i, '');
    if (/^(a|an)\s+single\s+(serum|step)\s+for\b/i.test(text)) {
      text = text.replace(/^(a|an)\s+single\s+(serum|step)\s+for\s+/i, 'Targets ');
    }
  }
  return text;
}

function compactNarrative(value: unknown, maxChars: number): string {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  if (text.length <= maxChars) return text;
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((item) => item.trim()).filter(Boolean) || [];
  let collected = '';
  for (const sentence of sentences) {
    const candidate = collected ? `${collected} ${sentence}` : sentence;
    if (candidate.length > maxChars) break;
    collected = candidate;
    if (collected.length >= Math.min(110, maxChars - 18)) break;
  }
  if (collected) return collected;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function textKey(value: unknown): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapScore(left: unknown, right: unknown): number {
  const leftTokens = new Set(textKey(left).split(' ').filter((token) => token.length > 2));
  const rightTokens = new Set(textKey(right).split(' ').filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function isLowSignalSellerHighlight(headline: unknown, body: unknown, evidenceProfile?: string): boolean {
  const profile = String(evidenceProfile || '').trim().toLowerCase();
  if (profile !== 'seller_only' && profile !== 'seller_plus_formula') return false;
  const combined = `${normalizeWhitespace(headline)} ${normalizeWhitespace(body)}`.toLowerCase();
  if (!combined) return false;
  return /(^|\b)(double up and save|stock up|save with|jumbo size|travel size|value size|value pack|limited edition|extended use)(\b|$)/.test(
    combined,
  );
}

function nonEmptyList(values: Array<unknown> | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeWhitespace(value)).filter(Boolean);
}

function evidenceLabel(profile?: string): string {
  const key = String(profile || '').trim().toLowerCase();
  if (key === 'seller_only') return 'Based on product and brand information';
  if (key === 'community_supported') return 'Includes product, review, and market signals';
  return 'Based on product data';
}

function qualityLabel(state?: string): string {
  const key = String(state || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'limited') return 'Limited';
  if (key === 'eligible') return 'Verified';
  if (key === 'blocked') return 'Blocked';
  return titleCase(key);
}

function normalizeHighlightHeadline(value: unknown): string {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  const key = text.toLowerCase();
  if (['positioning', 'overview', 'summary', 'details'].includes(key)) return '';
  return text;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}

export function PivotaInsightsSection({ data }: { data: ProductIntelData }) {
  const core = data.product_intel_core;
  if (!core) return null;

  const evidenceProfile = core.evidence_profile || data.evidence_profile || data.normalized_pdp?.evidence_profile;
  const qualityState = core.quality_state || data.quality_state || data.normalized_pdp?.quality_state;
  const badgeLabel = qualityLabel(qualityState);
  const whatItIsHeadline = normalizeWhitespace(core.what_it_is?.headline);
  const whatItIsBody = compactNarrative(
    normalizeNarrativeLead(core.what_it_is?.body, evidenceProfile),
    evidenceProfile === 'seller_only' ? 150 : 180,
  );
  const bestFor = Array.isArray(core.best_for)
    ? core.best_for
        .map((item) => normalizeWhitespace(item?.label || item?.tag))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const highlights = Array.isArray(core.why_it_stands_out)
    ? core.why_it_stands_out
        .map((item) => ({
          headline: normalizeHighlightHeadline(item?.headline),
          body: compactNarrative(
            normalizeHighlightBody(item?.body, evidenceProfile),
            evidenceProfile === 'seller_only' ? 76 : 108,
          ),
        }))
        .filter((item) => {
          const combined = [item.headline, item.body].filter(Boolean).join(' ');
          if (!combined) return false;
          if (isLowSignalSellerHighlight(item.headline, item.body, evidenceProfile)) return false;
          return tokenOverlapScore(combined, whatItIsBody) < 0.72;
        })
        .slice(0, evidenceProfile === 'seller_only' ? 2 : 3)
    : [];
  const routineStep = titleCase(String(core.routine_fit?.step || ''));
  const routineTime = nonEmptyList(core.routine_fit?.am_pm).map(titleCase).slice(0, 2);
  const pairingNotes = nonEmptyList(core.routine_fit?.pairing_notes)
    .map((item) => compactNarrative(item, 90))
    .slice(0, 2);
  const watchouts = Array.isArray(core.watchouts)
    ? core.watchouts
        .map((item) => ({
          label: compactNarrative(item?.label, 90),
          severity: titleCase(String(item?.severity || '')),
        }))
        .filter((item) => item.label)
        .slice(0, 3)
    : [];
  const texture = normalizeWhitespace(data.texture_finish?.texture);
  const finish = normalizeWhitespace(data.texture_finish?.finish);
  const communityAvailable = data.community_signals?.status === 'available';
  const communityLoves = nonEmptyList(data.community_signals?.top_loves)
    .map((item) => compactNarrative(item, 100))
    .slice(0, 2);
  const communityComplaints = nonEmptyList(data.community_signals?.top_complaints)
    .map((item) => compactNarrative(item, 100))
    .slice(0, 2);

  return (
    <section id="pivota-insights" className="bg-[#fcfaf6] px-2.5 py-4 sm:px-3">
      <div className="rounded-[24px] border border-[#e7dfd2] bg-white px-3 py-3 shadow-sm sm:px-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{data.display_name || 'Pivota Insights'}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{evidenceLabel(evidenceProfile)}</p>
          </div>
          {badgeLabel ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-100">
              {badgeLabel}
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            {(whatItIsHeadline || whatItIsBody || bestFor.length) ? (
              <div>
                <SectionLabel>What it is</SectionLabel>
                {whatItIsHeadline ? <p className="mt-1 text-sm font-semibold text-foreground">{whatItIsHeadline}</p> : null}
                {whatItIsBody ? <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{whatItIsBody}</p> : null}
                {bestFor.length ? (
                  <div className="mt-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {bestFor.map((item) => (
                        <span key={item} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {highlights.length ? (
              <div className="border-t border-border/50 pt-3">
                <SectionLabel>Why it stands out</SectionLabel>
                <div className="mt-2 space-y-2">
                  {highlights.map((item, index) => (
                    <div key={`${item.headline || item.body}-${index}`} className="flex gap-2 border-l border-[#e7dfd2] pl-3">
                      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-foreground/60" />
                      <div className="min-w-0">
                        {item.headline ? <p className="text-[13px] font-semibold leading-5 text-foreground">{item.headline}</p> : null}
                        {item.body ? <p className={item.headline ? 'text-[13px] leading-[1.45] text-muted-foreground' : 'text-[13px] leading-[1.45] text-muted-foreground'}>{item.body}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {(routineStep || routineTime.length || pairingNotes.length || texture || finish) ? (
              <div>
                <SectionLabel>How it fits in a routine</SectionLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {routineStep ? <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground">{routineStep}</span> : null}
                  {routineTime.map((item) => (
                    <span key={item} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground">{item}</span>
                  ))}
                  {texture ? <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">Texture: {texture}</span> : null}
                  {finish ? <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">Finish: {finish}</span> : null}
                </div>
                {pairingNotes.length ? (
                  <ul className="mt-2.5 space-y-1.5">
                    {pairingNotes.map((item) => (
                      <li key={item} className="flex gap-2 text-[13px] leading-[1.45] text-muted-foreground">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-foreground/60" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {watchouts.length ? (
              <div className="border-t border-border/50 pt-3">
                <SectionLabel>Watch-outs & compatibility</SectionLabel>
                <div className="mt-2 space-y-1.5">
                  {watchouts.map((item) => (
                    <div key={`${item.label}:${item.severity}`} className="flex items-start gap-2 border-l border-[#e7dfd2] pl-3">
                      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-foreground/60" />
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <p className="text-[13px] leading-[1.45] text-foreground">{item.label}</p>
                        {item.severity ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.severity}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {communityAvailable && (communityLoves.length || communityComplaints.length) ? (
          <div className="mt-3 border-t border-border/60 pt-3">
            <SectionLabel>Community signals</SectionLabel>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {communityLoves.length ? (
                <div className="rounded-2xl bg-[#faf7f1] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">What people notice</p>
                  <ul className="mt-2 space-y-2">
                    {communityLoves.map((item) => (
                      <li key={item} className="flex gap-2 text-[13px] leading-5 text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-foreground/60" /><span>{item}</span></li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {communityComplaints.length ? (
                <div className="rounded-2xl bg-[#faf7f1] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Common complaints</p>
                  <ul className="mt-2 space-y-2">
                    {communityComplaints.map((item) => (
                      <li key={item} className="flex gap-2 text-[13px] leading-5 text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-foreground/60" /><span>{item}</span></li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
