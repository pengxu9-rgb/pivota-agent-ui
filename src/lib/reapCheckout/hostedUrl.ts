// THE ONE LINK THIS UI WILL OPEN FOR A REAP CHECKOUT: Reap's own hosted payment page.
//
// The buyer enters their card and approves the total on Reap's page, in a NEW tab, and nowhere
// else. Pivota never holds or moves money: this UI never collects card data, never embeds or
// iframes Reap's page, and never proxies it. The only thing it does with the page is hand its URL
// to `window.open` -- and only after this check says the URL is Reap's.
//
// The rule (every clause refuses something; see hostedUrl.test.ts for the refusing examples):
//   - parses as an absolute URL, scheme exactly `https:`
//   - no userinfo (`https://reap.global@evil.example/` is evil.example)
//   - default port only (an explicit :443 is normalised away by URL; any other port refuses)
//   - hostname equal to an allowed suffix, or ending in "." + that suffix -- a DOT-suffix, so
//     `evilreap.global` and `reap.global.evil.com` both refuse
//   - an IP literal never matches (no allowed suffix is numeric, and IPv6 hosts are bracketed)
//
// The allowed suffixes are the SAME TWO the gateway's Reap lane and the backend's rail vouch for
// (PIVOTA-Agent mcp-server/src/ucpReapAgenticLane.js REAP_HOSTED_URL_SUFFIXES; pivota-backend
// docs/runbooks/reap_agentic_purchase.md, "exact-or-dot-suffix on prava.space/reap.global").
// `pay.prava.space` is where Reap's hosted card-entry and approval pages are served in the
// backend's recorded fixtures, so a list without it would refuse every real hand-off. The list is
// a constant, not an env var: widening where a buyer is sent to pay is a code change with review.
export const REAP_HOSTED_URL_SUFFIXES: readonly string[] = Object.freeze(['reap.global', 'prava.space']);

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * The URL, re-serialised, when it is a Reap hosted page this UI may open; otherwise null.
 * Never throws.
 */
export function vetReapHostedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port !== '') return null;
  const host = url.hostname.toLowerCase();
  if (!host || host.endsWith('.')) return null;
  if (!REAP_HOSTED_URL_SUFFIXES.some((suffix) => hostMatchesSuffix(host, suffix))) return null;
  return url.toString();
}
