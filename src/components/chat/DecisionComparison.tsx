'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { refreshDecisionReport, MAX_EVIDENCE_AGE_MS } from '@/features/shopping/evidenceFreshness';
import Image from 'next/image';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import { useRouter } from 'next/navigation';
import { buildProductHrefForProduct } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import type { ProductResponse } from '@/lib/api';
import type { DecisionReport } from '@/features/shopping/model';
import { productKey } from '@/features/shopping/model';
import { safeSourceUrl } from '@/features/shopping/decision';

export function DecisionComparison({ report: savedReport, onSave, savedProducts = [] }: { report: DecisionReport; onSave?: (product: ProductResponse) => void; savedProducts?: ProductResponse[] }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const report = refreshDecisionReport(savedReport, new Date(Math.max(now, Date.now())));
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const upcoming = savedReport.items.flatMap((item) => item.sources.map((source) => Date.parse(source.observedAt || '') + MAX_EVIDENCE_AGE_MS)).filter((time) => Number.isFinite(time) && time > now);
    const timeout = upcoming.length ? window.setTimeout(refresh, Math.min(2147483647, Math.max(1, Math.min(...upcoming) - Date.now()))) : undefined;
    window.addEventListener('focus', refresh);
    return () => { if (timeout !== undefined) window.clearTimeout(timeout); window.removeEventListener('focus', refresh); };
  }, [savedReport, now]);
  return <section aria-label={report.compared ? 'Product comparison' : 'Product evidence'} className="space-y-3">
    <p className="rounded-xl bg-[#EEEDFE] p-3 text-sm leading-relaxed">{report.summary}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {report.items.map((item, index) => <article key={productKey(item.product)} className="min-w-0 rounded-xl border border-border p-3 text-sm">
        {item.product.image_url ? <div className="relative mb-3 h-32 w-full overflow-hidden rounded-lg bg-[#F4F4F2]"><Image src={normalizeDisplayImageUrl(item.product.image_url, '/placeholder.svg')} alt={item.product.title} fill sizes="(min-width: 640px) 300px, 100vw" className="object-contain" unoptimized /></div> : null}
        <h3 className="font-semibold">{index + 1}. {item.product.title}</h3>
        {item.eligibility === 'rejected' ? <p className="mt-2 font-semibold text-red-800">Rejected for your brief</p> : item.eligibility === 'unverified' ? <p className="mt-2 text-[#534AB7]">Requirements still need verification</p> : null}
        <p className="mt-2">{item.size} · {item.price}</p>
        <p>Retailer: {item.retailer}</p>
        {report.fragranceRequired ? <p className={`mt-2 font-semibold ${item.fragrance === 'conflict' ? 'text-red-800' : 'text-[#534AB7]'}`}>Fragrance-free: {item.fragrance === 'conflict' ? 'Ingredient conflict' : item.fragrance === 'verified' ? 'Sourced claim verified' : 'Unverified'}</p> : null}
        {item.tradeoffs.map((line) => <p key={line} className="mt-2">{line}</p>)}
        <details className="mt-3">
          <summary className="cursor-pointer font-medium">{report.includeIngredients ? 'Ingredient evidence and exact item' : 'Sources and exact item'}</summary>
          {report.includeIngredients ? <p className="mt-2 break-words text-xs leading-relaxed">{item.ingredientEvidence}</p> : null}
          <p className="mt-2 break-all text-xs">Product ID: {item.product.product_id}<br />Seller ID: {item.product.merchant_id || 'Not provided'}<br />Variant ID: {item.variantId || 'Not provided'}</p>
          {item.alternatives.length ? <div className="mt-2 text-xs">Other sizes from this retailer (not selected):<ul>{item.alternatives.map((line) => <li key={line}>{line}</li>)}</ul></div> : null}
        </details>
        {item.missing.length ? <div className="mt-3 text-xs"><span className="font-semibold">Still unverified</span><ul className="ml-4 list-disc">{item.missing.map((line) => <li key={line}>{line}</li>)}</ul></div> : null}
        <div className="mt-3 flex flex-wrap gap-3 text-xs"><Link href={buildProductHrefForProduct(item.product)} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); router.push(appendCurrentPathAsReturn(buildProductHrefForProduct(item.product))); }} className="text-[#534AB7] underline">View product details</Link>{onSave ? <button type="button" onClick={() => onSave(item.product)} aria-pressed={savedProducts.some((saved) => productKey(saved) === productKey(item.product))} className="text-[#534AB7] underline">{savedProducts.some((saved) => productKey(saved) === productKey(item.product)) ? 'Remove from saved' : 'Save to your list'}</button> : null}</div>
        <ul className="mt-3 space-y-1 text-xs">{item.sources.filter((source) => safeSourceUrl(source.url)).map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words text-[#534AB7] underline">{source.label}</a>{source.observedAt ? ` · observed ${source.observedAt.slice(0, 10)}` : ' · source capture date unavailable'}{source.stale ? ' · needs rechecking' : ''}</li>)}</ul>
      </article>)}
    </div>
  </section>;
}
