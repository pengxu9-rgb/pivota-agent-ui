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
