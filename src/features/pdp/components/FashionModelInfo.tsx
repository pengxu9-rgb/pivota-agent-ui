'use client';

/**
 * FashionModelInfo
 *
 * "Model is 5'8" wearing M · 36DD bust, 32" waist" inline pill that sits
 * under the size selector. Avatar is optional; renders without it as a
 * single-line text block when missing.
 */

export function FashionModelInfo({
  info,
  avatarUrl,
}: {
  info: string;
  avatarUrl?: string | null;
}) {
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2.5 mx-[18px]">
      {avatarUrl ? (
        <div
          className="h-9 w-9 shrink-0 rounded-full bg-cover bg-center"
          style={{ backgroundImage: `url(${avatarUrl})` }}
        />
      ) : null}
      <p className="text-[11.5px] leading-snug text-muted-foreground">{info}</p>
    </div>
  );
}
