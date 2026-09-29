// Display formatting for an amount the checkout already states in ISO minor units. This is
// presentation only (the currency's own fraction digits, from Intl) — no arithmetic on prices.
export function formatMinorAmount(amountMinor: number, currency: string | null, locale = 'en-US'): string {
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
  // Without a currency the minor units cannot be placed (cents? yen?): show nothing rather than a wrong number.
  if (!code) return '—';
  try {
    const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: code });
    const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    const negative = amountMinor < 0;
    const text = fmt.format(Math.abs(amountMinor) / 10 ** digits);
    return negative ? `−${text}` : text;
  } catch {
    return `${amountMinor} ${code}`;
  }
}
