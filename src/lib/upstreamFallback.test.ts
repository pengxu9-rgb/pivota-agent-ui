import { afterEach, describe, expect, it, vi } from 'vitest';
import { warnIfHardcodedFallbackUsed } from './upstreamFallback';

describe('warnIfHardcodedFallbackUsed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('suppresses fallback warnings during next build', () => {
    vi.stubEnv('npm_lifecycle_event', 'build');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    warnIfHardcodedFallbackUsed({
      routeLabel: 'api/test-build',
      envVarsTried: ['TEST_UPSTREAM_BASE'],
      fallback: 'https://example.com',
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still logs once at runtime when a hardcoded fallback is used', () => {
    vi.stubEnv('npm_lifecycle_event', 'start');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const opts = {
      routeLabel: 'api/test-runtime',
      envVarsTried: ['TEST_UPSTREAM_BASE'],
      fallback: 'https://example.com',
    };

    warnIfHardcodedFallbackUsed(opts);
    warnIfHardcodedFallbackUsed(opts);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('[api/test-runtime] No upstream env var set');
  });
});
