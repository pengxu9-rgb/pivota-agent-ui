import { describe, expect, it } from 'vitest';
import { formatMoney } from './formatMoney';

describe('offer money formatting', () => {
  it.each([
    [4.62, 'USD', '$4.62'],
    [42, 'USD', '$42'],
    [4.6, 'usd', '$4.60'],
    [462, 'JPY', '¥462'],
    [1.234, 'KWD', 'KWD 1.234'],
    [null, 'USD', ''],
    [NaN, 'USD', ''],
    [4.62, 'invalid', 'INVALID 4.62'],
  ])('formats %s %s as %s', (amount, currency, expected) => {
    expect(formatMoney(amount, currency)).toBe(expected);
  });
});
