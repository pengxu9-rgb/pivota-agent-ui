import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSheet } from './ResponsiveSheet';

function mockMatchMedia(matches: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  vi.stubGlobal('matchMedia', matchMedia);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
}

describe('ResponsiveSheet', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('renders the mobile footer outside the scroll body and pads it for the safe area', () => {
    mockMatchMedia(false);

    render(
      <ResponsiveSheet
        open
        onClose={() => {}}
        title="Sheet title"
        footer={<div>Footer action</div>}
      >
        <div>Body content</div>
      </ResponsiveSheet>,
    );

    const sheet = screen.getByTestId('responsive-sheet');
    const body = screen.getByTestId('responsive-sheet-body');
    const footer = screen.getByTestId('responsive-sheet-footer');

    expect(sheet).toHaveAttribute('data-variant', 'mobile');
    expect(body).toHaveTextContent('Body content');
    expect(body).not.toContainElement(screen.getByText('Footer action'));
    expect(footer).toHaveTextContent('Footer action');
    expect(footer.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(body.className).not.toContain('pb-[env(safe-area-inset-bottom)]');
  });

  it('pads the mobile scroll body for the safe area when no footer is provided', () => {
    mockMatchMedia(false);

    render(
      <ResponsiveSheet open onClose={() => {}} title="Sheet title">
        <div>Body content</div>
      </ResponsiveSheet>,
    );

    const body = screen.getByTestId('responsive-sheet-body');

    expect(screen.queryByTestId('responsive-sheet-footer')).toBeNull();
    expect(body.className).toContain('pb-[env(safe-area-inset-bottom)]');
  });

  it('switches to the centered desktop dialog when the desktop media query matches', async () => {
    mockMatchMedia(true);

    render(
      <ResponsiveSheet
        open
        onClose={() => {}}
        title="Sheet title"
        footer={<div>Footer action</div>}
      >
        <div>Body content</div>
      </ResponsiveSheet>,
    );

    await waitFor(() => {
      const desktopSheet = document.querySelector('[data-testid="responsive-sheet"][data-variant="desktop"]');
      expect(desktopSheet).not.toBeNull();
    });

    const desktopSheet = document.querySelector(
      '[data-testid="responsive-sheet"][data-variant="desktop"]',
    ) as HTMLElement | null;
    expect(desktopSheet).not.toBeNull();
    const footer = desktopSheet?.querySelector('[data-testid="responsive-sheet-footer"]') as HTMLElement | null;
    expect(footer).not.toBeNull();
    expect(footer?.className).not.toContain('pb-[env(safe-area-inset-bottom)]');
  });
});
