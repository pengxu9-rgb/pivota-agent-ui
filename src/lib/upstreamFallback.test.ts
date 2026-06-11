import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireUpstreamBase, warnIfHardcodedFallbackUsed } from './upstreamFallback';

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

describe('requireUpstreamBase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const opts = {
    routeLabel: 'api/test-require',
    envVarsTried: ['PRIMARY_BASE', 'SECONDARY_BASE'],
    fallback: 'https://hardcoded-prod.example.com',
  };

  it('returns the env value when set (first match wins)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SECONDARY_BASE', 'https://configured.example.com');
    expect(requireUpstreamBase(opts)).toBe('https://configured.example.com');
  });

  it('THROWS in a production runtime when no env var is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('npm_lifecycle_event', 'start');
    expect(() => requireUpstreamBase(opts)).toThrowError(/Missing required upstream base env var/);
  });

  it('returns the fallback during next build even in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('npm_lifecycle_event', 'build');
    expect(requireUpstreamBase(opts)).toBe(opts.fallback);
  });

  it('warns and returns the fallback in non-prod runtimes', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('npm_lifecycle_event', 'dev');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(requireUpstreamBase({ ...opts, routeLabel: 'api/test-require-dev' })).toBe(opts.fallback);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
