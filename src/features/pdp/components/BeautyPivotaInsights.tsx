'use client';

/**
 * Pivota Insights — the signature cream "paper" card on the Beauty mobile PDP.
 * Faithful to redesign/pivota-pdp-extras.jsx → PivotaInsights:
 *   #FCFAF6 paper backdrop, white inset card (#E7DFD2 border, 24px radius),
 *   gradient sparkle header, then SectionLabel-led blocks — What it is,
 *   Why it stands out, How it fits in a routine, Watch-outs, and a
 *   Community signals row of #FAF7F1 sub-cards.
 */

export type BeautyInsightsData = {
  displayName?: string | null;
  evidenceLabel?: string | null;
  whatItIs?: { headline?: string | null; body?: string | null } | null;
  bestFor?: string[] | null;
  highlights?: Array<{ headline?: string | null; body?: string | null }> | null;
  routine?: {
    step?: string | null;
    amPm?: string[] | null;
    texture?: string | null;
    finish?: string | null;
    pairingNotes?: string[] | null;
  } | null;
  watchouts?: Array<{ label?: string | null; severity?: string | null }> | null;
  community?: { loves?: string[] | null; complaints?: string[] | null } | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-[3px]"
      style={{ background: 'rgba(44,44,42,0.6)' }}
    />
  );
}

function RoutineChip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? 'rounded-full bg-[#F4F4F2] px-2.5 py-1 text-[11px] font-medium text-foreground'
          : 'rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-foreground'
      }
    >
      {children}
    </span>
  );
}

function CommunityCard({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-2xl bg-[#FAF7F1] px-3 py-2.5">
      <SectionLabel>{label}</SectionLabel>
      <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-[1.45] text-muted-foreground">
            <Dot />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BeautyPivotaInsights({ insights }: { insights: BeautyInsightsData | null | undefined }) {
  if (!insights) return null;
  const {
    displayName = 'Pivota Insights',
    evidenceLabel,
    whatItIs,
    bestFor,
    highlights,
    routine,
    watchouts,
    community,
  } = insights;

  const hasBody =
    whatItIs?.headline ||
    whatItIs?.body ||
    bestFor?.length ||
    highlights?.length ||
    routine?.step ||
    routine?.pairingNotes?.length ||
    watchouts?.length;
  if (!hasBody) return null;

  return (
    <div className="mt-2.5 bg-[#FCFAF6] px-3 py-3">
      <div className="rounded-[24px] border border-[#E7DFD2] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(20,10,40,0.04)]">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-white"
            style={{ background: 'linear-gradient(135deg, #534AB7, #1D9E75)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
            </svg>
          </span>
          <h2 className="text-[15px] font-semibold text-foreground">{displayName}</h2>
        </div>
        {evidenceLabel ? (
          <div className="mt-1 text-[11.5px] text-muted-foreground">{evidenceLabel}</div>
        ) : null}

        <div className="mt-3.5 flex flex-col gap-3.5 border-t border-border pt-3.5">
          {/* What it is */}
          {whatItIs?.headline || whatItIs?.body || bestFor?.length ? (
            <div>
              <SectionLabel>What it is</SectionLabel>
              {whatItIs?.headline ? (
                <div className="mt-1 text-[13.5px] font-semibold leading-[1.35] text-foreground">
                  {whatItIs.headline}
                </div>
              ) : null}
              {whatItIs?.body ? (
                <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">{whatItIs.body}</p>
              ) : null}
              {bestFor?.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {bestFor.map((b) => (
                    <span
                      key={b}
                      className="rounded-full bg-[#F4F4F2] px-2.5 py-1 text-[11px] font-medium text-foreground"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Why it stands out */}
          {highlights?.length ? (
            <div className="border-t border-border pt-3">
              <SectionLabel>Why it stands out</SectionLabel>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {highlights.map((h, i) => (
                  <div key={i} className="flex gap-2.5 border-l border-[#E7DFD2] pl-3">
                    <Dot />
                    <div>
                      {h.headline ? (
                        <div className="text-[13px] font-semibold leading-[1.4] text-foreground">
                          {h.headline}
                        </div>
                      ) : null}
                      {h.body ? (
                        <div className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
                          {h.body}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* How it fits in a routine */}
          {routine?.step || routine?.pairingNotes?.length ? (
            <div className="border-t border-border pt-3">
              <SectionLabel>How it fits in a routine</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {routine?.step ? <RoutineChip>{routine.step}</RoutineChip> : null}
                {(routine?.amPm || []).map((t) => (
                  <RoutineChip key={t}>{t}</RoutineChip>
                ))}
                {routine?.texture ? <RoutineChip muted>Texture: {routine.texture}</RoutineChip> : null}
                {routine?.finish ? <RoutineChip muted>Finish: {routine.finish}</RoutineChip> : null}
              </div>
              {routine?.pairingNotes?.length ? (
                <ul className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
                  {routine.pairingNotes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] leading-[1.45] text-muted-foreground">
                      <Dot />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Watch-outs & compatibility */}
          {watchouts?.length ? (
            <div className="border-t border-border pt-3">
              <SectionLabel>Watch-outs &amp; compatibility</SectionLabel>
              <div className="mt-2 flex flex-col gap-1.5">
                {watchouts.map((w, i) => (
                  <div key={i} className="flex gap-2 border-l border-[#E7DFD2] pl-3">
                    <Dot />
                    <div className="flex flex-1 justify-between gap-3">
                      <span className="text-[12.5px] leading-[1.45] text-foreground">{w.label}</span>
                      {w.severity ? (
                        <span className="mt-0.5 flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
                          {w.severity}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Community signals */}
        {community?.loves?.length || community?.complaints?.length ? (
          <div className="mt-3.5 border-t border-border pt-3.5">
            <SectionLabel>Community signals</SectionLabel>
            <div className="mt-2 flex flex-col gap-2">
              <CommunityCard label="What people notice" items={community?.loves || []} />
              <CommunityCard label="Common complaints" items={community?.complaints || []} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
