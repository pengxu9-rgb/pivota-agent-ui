// A buyer constraint captured from the displayed own-offer item price. The server
// independently validates price; this snapshot never authorizes a catalog amount.
export type ExpectedMoney = { expected_unit_price_minor: number; expected_currency: string };
export function readExpectedMoney(value: unknown): ExpectedMoney | undefined | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const hasUnit = Object.prototype.hasOwnProperty.call(v, 'expected_unit_price_minor');
  const hasCurrency = Object.prototype.hasOwnProperty.call(v, 'expected_currency');
  if (!hasUnit && !hasCurrency) return undefined;
  if (!hasUnit || !hasCurrency || typeof v.expected_unit_price_minor !== 'number'
    || !Number.isSafeInteger(v.expected_unit_price_minor) || v.expected_unit_price_minor < 1
    || typeof v.expected_currency !== 'string' || !/^[A-Z]{3}$/.test(v.expected_currency)) return null;
  return { expected_unit_price_minor: v.expected_unit_price_minor, expected_currency: v.expected_currency };
}
export function snapshotDisplayedMoney(amount: unknown, currency: unknown): ExpectedMoney | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0
    || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null;
  // Decimal text, not rounding, prevents silently changing the displayed amount.
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(amount));
  if (!match) return null;
  let digits: number;
  try { digits = new Intl.NumberFormat('en-US', {style:'currency',currency}).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return null; }
  const fraction = match[2] || '';
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) return null;
  const minor = Number(match[1] + fraction.slice(0,digits).padEnd(digits,'0'));
  return readExpectedMoney({expected_unit_price_minor:minor,expected_currency:currency}) || null;
}
