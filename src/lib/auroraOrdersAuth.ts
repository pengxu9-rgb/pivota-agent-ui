'use client';

import { getAllowedParentOrigin, isAuroraEmbedMode } from '@/lib/auroraEmbed';

const SCHEMA_VERSION = '0.1' as const;
const SHOP_KIND = 'pivota_shop_bridge' as const;
const AURORA_KIND = 'aurora_shop_bridge' as const;
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 3500;
const RECENT_EXCHANGE_FAILURE_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.NEXT_PUBLIC_AURORA_EXCHANGE_FAILURE_COOLDOWN_MS || 15000) || 15000,
);

type AuthBootstrapRequestPayload = {
  request_id: string;
  occurred_at: string;
  scope: 'orders';
};

type AuthBootstrapResponsePayload = {
  request_id: string;
  ok: boolean;
  aurora_uid: string;
  auth_token?: string;
  email?: string;
  expires_at?: string | null;
  error_code?: string;
};

type ShopAuthBootstrapRequestMessage = {
  schema_version: typeof SCHEMA_VERSION;
  kind: typeof SHOP_KIND;
  event: 'auth_bootstrap_request';
  payload: AuthBootstrapRequestPayload;
};

type AuroraAuthBootstrapResponseMessage = {
  schema_version: typeof SCHEMA_VERSION;
  kind: typeof AURORA_KIND;
  event: 'auth_bootstrap_response';
  payload: AuthBootstrapResponsePayload;
};

type AuroraOrdersSessionResult = { ok: true } | { ok: false; reason: string };

let inflightExchange: Promise<AuroraOrdersSessionResult> | null = null;
let lastExchangeFailureAt = 0;
let lastExchangeFailureReason = '';
const PDP_AUTO_EXCHANGE_ENABLED = String(
  process.env.NEXT_PUBLIC_AURORA_AUTO_EXCHANGE_PDP_ENABLED || '1',
).trim() !== '0';

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const randomId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `aurora_auth_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const isOrdersPath = (pathname: string | null | undefined): boolean => {
  const p = String(pathname || '').trim();
  if (!p) return false;
  return p === '/orders' || p.startsWith('/orders/') || p === '/my-orders';
};

const isPdpUgcPath = (pathname: string | null | undefined): boolean => {
  const p = String(pathname || '').trim();
  if (!p) return false;
  return p === '/products' || p.startsWith('/products/') || p === '/reviews/write';
};

const resolveEntrySurface = (pathname: string | null | undefined): string => {
  const p = String(pathname || '').trim();
  if (!p) return 'unknown';
  if (isOrdersPath(p)) return 'orders';
  if (p.startsWith('/products/')) return 'pdp';
  if (p === '/reviews/write') return 'write_review_page';
  return 'unknown';
};

const trackAuroraExchange = (payload: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log('[TRACK]', 'aurora_exchange_attempt_total', {
    ...payload,
    ts: new Date().toISOString(),
  });
};

export const isAuroraAutoExchangePath = (pathname: string | null | undefined): boolean => {
  if (isOrdersPath(pathname)) return true;
  if (!PDP_AUTO_EXCHANGE_ENABLED) return false;
  return isPdpUgcPath(pathname);
};

export const shouldUseAuroraAutoExchange = (pathname?: string | null): boolean => {
  if (typeof window === 'undefined') return false;
  if (!isAuroraEmbedMode()) return false;
  const currentPath = String(pathname || window.location.pathname || '').trim();
  return isAuroraAutoExchangePath(currentPath);
};

export const shouldUseAuroraOrdersAutoExchange = shouldUseAuroraAutoExchange;

const isAuthBootstrapResponseMessage = (input: unknown): input is AuroraAuthBootstrapResponseMessage => {
  if (!isObject(input)) return false;
  if (input.schema_version !== SCHEMA_VERSION) return false;
  if (input.kind !== AURORA_KIND) return false;
  if (input.event !== 'auth_bootstrap_response') return false;
  const payload = (input as AuroraAuthBootstrapResponseMessage).payload;
  if (!isObject(payload)) return false;
  if (!isNonEmptyString(payload.request_id)) return false;
  if (typeof payload.ok !== 'boolean') return false;
  if (!isNonEmptyString(payload.aurora_uid)) return false;
  return true;
};

const requestBootstrapFromParent = async (
  timeoutMs: number = DEFAULT_BOOTSTRAP_TIMEOUT_MS,
): Promise<AuthBootstrapResponsePayload> => {
  if (typeof window === 'undefined') {
    throw new Error('NO_WINDOW');
  }
  if (window.parent === window) {
    throw new Error('NOT_EMBED');
  }
  const parentOrigin = getAllowedParentOrigin();
  if (!parentOrigin) {
    throw new Error('PARENT_ORIGIN_UNAVAILABLE');
  }

  const requestId = randomId();
  const req: ShopAuthBootstrapRequestMessage = {
    schema_version: SCHEMA_VERSION,
    kind: SHOP_KIND,
    event: 'auth_bootstrap_request',
    payload: {
      request_id: requestId,
      occurred_at: new Date().toISOString(),
      scope: 'orders',
    },
  };

  return await new Promise<AuthBootstrapResponsePayload>((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timer) window.clearTimeout(timer);
    };
    const finishResolve = (payload: AuthBootstrapResponsePayload) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(payload);
    };
    const finishReject = (reason: string) => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(reason));
    };

    const onMessage = (evt: MessageEvent) => {
      if (evt.origin !== parentOrigin) return;
      const data = evt.data;
      if (!isAuthBootstrapResponseMessage(data)) return;
      const payload = data.payload;
      if (payload.request_id !== requestId) return;
      finishResolve(payload);
    };

    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finishReject('BOOTSTRAP_TIMEOUT'), Math.max(1000, timeoutMs));

    try {
      window.parent.postMessage(req, parentOrigin);
    } catch {
      finishReject('POST_MESSAGE_FAILED');
    }
  });
};

const parseErrorCode = (payload: unknown): string => {
  if (!isObject(payload)) return '';
  if (isNonEmptyString(payload.code)) return payload.code.trim();
  const detail = payload.detail;
  if (isObject(detail)) {
    const error = detail.error;
    if (isObject(error) && isNonEmptyString(error.code)) return String(error.code).trim();
  }
  const error = payload.error;
  if (isObject(error) && isNonEmptyString(error.code)) return String(error.code).trim();
  if (isNonEmptyString(payload.error)) return payload.error.trim();
  return '';
};

const exchangeAuroraSession = async (
  bootstrap: AuthBootstrapResponsePayload,
): Promise<AuroraOrdersSessionResult> => {
  const auroraToken = String(bootstrap.auth_token || '').trim();
  const auroraUid = String(bootstrap.aurora_uid || '').trim();
  if (!auroraToken || !auroraUid) {
    return { ok: false, reason: 'MISSING_BOOTSTRAP_TOKEN' };
  }

  let res: Response;
  try {
    res = await fetch('/api/accounts/auth/aurora/exchange', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        aurora_token: auroraToken,
        aurora_uid: auroraUid,
      }),
    });
  } catch {
    return { ok: false, reason: 'EXCHANGE_REQUEST_FAILED' };
  }

  if (res.ok) {
    return { ok: true };
  }

  const payload = await res.json().catch(() => null);
  const code = parseErrorCode(payload);
  if (code) return { ok: false, reason: code };
  return { ok: false, reason: `HTTP_${res.status}` };
};

export async function ensureAuroraSession(pathname?: string | null): Promise<AuroraOrdersSessionResult> {
  const currentPath =
    String(pathname || (typeof window !== 'undefined' ? window.location.pathname : '') || '').trim() || null;
  if (!shouldUseAuroraAutoExchange(currentPath)) {
    return { ok: false, reason: 'NOT_APPLICABLE' };
  }
  const elapsedSinceFailure = Date.now() - lastExchangeFailureAt;
  if (lastExchangeFailureAt > 0 && elapsedSinceFailure < RECENT_EXCHANGE_FAILURE_COOLDOWN_MS) {
    return { ok: false, reason: lastExchangeFailureReason || 'RECENT_EXCHANGE_FAILURE' };
  }
  if (inflightExchange) return inflightExchange;

  inflightExchange = (async () => {
    const commitResult = (result: AuroraOrdersSessionResult): AuroraOrdersSessionResult => {
      if (result.ok) {
        lastExchangeFailureAt = 0;
        lastExchangeFailureReason = '';
      } else {
        lastExchangeFailureAt = Date.now();
        lastExchangeFailureReason = String(result.reason || 'EXCHANGE_FAILED');
      }
      return result;
    };

    trackAuroraExchange({
      result: 'attempt',
      reason: null,
      entry_surface: resolveEntrySurface(currentPath),
      path: currentPath,
    });
    let bootstrap: AuthBootstrapResponsePayload;
    try {
      bootstrap = await requestBootstrapFromParent();
    } catch (err) {
      const reason = err instanceof Error && err.message ? err.message : 'BOOTSTRAP_FAILED';
      trackAuroraExchange({
        result: 'failed',
        reason,
        entry_surface: resolveEntrySurface(currentPath),
        path: currentPath,
      });
      return commitResult({ ok: false, reason });
    }

    if (!bootstrap.ok) {
      const reason = String(bootstrap.error_code || 'NO_AURORA_SESSION');
      trackAuroraExchange({
        result: 'failed',
        reason,
        entry_surface: resolveEntrySurface(currentPath),
        path: currentPath,
      });
      return commitResult({ ok: false, reason });
    }

    const exchangeResult = await exchangeAuroraSession(bootstrap);
    trackAuroraExchange({
      result: exchangeResult.ok ? 'ok' : 'failed',
      reason: exchangeResult.ok ? null : exchangeResult.reason,
      entry_surface: resolveEntrySurface(currentPath),
      path: currentPath,
    });
    return commitResult(exchangeResult);
  })();

  try {
    return await inflightExchange;
  } finally {
    inflightExchange = null;
  }
}

export async function ensureAuroraOrdersSession(pathname?: string | null): Promise<AuroraOrdersSessionResult> {
  return ensureAuroraSession(pathname);
}
