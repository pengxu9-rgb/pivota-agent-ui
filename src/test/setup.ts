import '@testing-library/jest-dom/vitest';

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
