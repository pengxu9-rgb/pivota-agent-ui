'use client';

// THE BUYER'S OWN MARKET, CHOSEN (src/lib/buyerMarket.ts: choice > located > storefront).
//
// A plain <select> over the markets the gateway can price. Choosing one writes the
// `pv_market` cookie and reloads the page, so every call the page makes from then
// on -- search, PDP, offers -- is keyed to that market. "Use my location" clears
// the choice and the located market (or the storefront market) takes over again.
// Nothing here guesses: the current value is read from the cookies the storefront
// already holds, and the label says which declaration is in force.
//
// A market change EMPTIES THE BAG. Lines were priced in the old market's currency by
// the old market's merchants; checkout after the change would run under the new
// market against those lines. The drawer also refuses a mixed-currency bag, so a
// located-market change (travel, no selector) is caught there.

import { useEffect, useState } from 'react';
import {
  MARKET_CHOICE_COOKIE,
  MARKET_LABELS,
  PRICEABLE_MARKETS,
  resolveBuyerMarketDetailed,
  type BuyerMarketSource,
} from '@/lib/buyerMarket';
import { useCartStore } from '@/store/cartStore';

const CHOICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
/** The option that clears the choice. */
export const LOCATED_OPTION = '';

export function writeMarketChoice(market: string | null): void {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = market
    ? `${MARKET_CHOICE_COOKIE}=${market}; path=/; max-age=${CHOICE_MAX_AGE_SECONDS}; samesite=lax${secure}`
    : `${MARKET_CHOICE_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
}

const SOURCE_HINT: Record<BuyerMarketSource, string> = {
  caller: 'Market',
  choice: 'Your market',
  located: 'Market from your location',
  storefront: 'Market',
};

export default function MarketSelector({ compact = false }: { compact?: boolean }) {
  // Rendered server-side with no cookie, then corrected on the client: the SSR document is one
  // document for everyone, and the cookie is the browser's.
  const [state, setState] = useState<{ market: string; source: BuyerMarketSource }>({ market: 'US', source: 'storefront' });
  useEffect(() => {
    setState(resolveBuyerMarketDetailed());
  }, []);

  const markets = [...PRICEABLE_MARKETS].sort((a, b) => MARKET_LABELS[a].localeCompare(MARKET_LABELS[b]));
  const value = state.source === 'choice' ? state.market : LOCATED_OPTION;
  const hint = SOURCE_HINT[state.source];

  return (
    <label
      className={
        compact
          ? 'inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ece5dd] bg-white px-3 text-[12px] text-slate-600 shadow-[0_6px_16px_rgba(15,23,42,0.06)] sm:h-10'
          : 'flex items-center justify-between gap-2 rounded-full bg-[#F4F4F2] px-3 py-2 text-[12px]'
      }
      style={compact ? undefined : { color: '#2C2C2A' }}
    >
      <span className={compact ? 'sr-only' : 'font-medium'}>{hint}</span>
      <select
        aria-label={`${hint}: ${MARKET_LABELS[state.market] || state.market}`}
        data-market={state.market}
        data-market-source={state.source}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          writeMarketChoice(next === LOCATED_OPTION ? null : next);
          const after = resolveBuyerMarketDetailed();
          if (after.market !== state.market) useCartStore.getState().clearCart();
          window.location.reload();
        }}
        className="max-w-[160px] bg-transparent text-[12px] font-medium outline-none"
      >
        <option value={LOCATED_OPTION}>
          {state.source === 'choice' ? 'Use my location' : `${MARKET_LABELS[state.market] || state.market} (auto)`}
        </option>
        {markets.map((code) => (
          <option key={code} value={code}>
            {MARKET_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
