import '@testing-library/jest-dom/vitest';

// Default tests to the legacy generic PDP layout; the new GenericPDPMobile/Desktop
// shell migration is gated on this env var. Individual tests for the new shell
// override via vi.stubEnv.
process.env.NEXT_PUBLIC_GENERIC_PDP_USE_STANDARD_SHELL = 'false';

const toConsoleText = (args: unknown[]): string =>
  args
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item instanceof Error) return `${item.name}: ${item.message}`;
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join(' ');

const shouldSuppressError = (text: string): boolean => {
  return /Not implemented: navigation to another Document/i.test(text);
};

const originalError = console.error.bind(console);

console.error = (...args: Parameters<typeof console.error>) => {
  if (shouldSuppressError(toConsoleText(args))) return;
  originalError(...args);
};

// jsdom lacks Web Crypto digest and Web Locks. This serial queue models browser locks.
import { webcrypto } from 'node:crypto';
if (typeof navigator !== 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  let lock = Promise.resolve();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (_name: string, callback: () => Promise<unknown>) => {
      const result = lock.then(callback);
      lock = result.then(() => undefined, () => undefined);
      return result;
    },
  } });
}
