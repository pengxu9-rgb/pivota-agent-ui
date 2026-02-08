'use client';

const SCHEMA_VERSION = '0.1' as const;
const SHOP_KIND = 'pivota_shop_bridge' as const;

type ShopBridgeEnvelope<TEvent extends string, TPayload> = {
  schema_version: typeof SCHEMA_VERSION;
  kind: typeof SHOP_KIND;
  event: TEvent;
  payload: TPayload;
};

export type ShopRequestClosePayload = {
  occurred_at: string;
  reason?: string;
  pathname?: string;
};

export type ShopRequestCloseMessage = ShopBridgeEnvelope<'request_close', ShopRequestClosePayload>;

const safeUrlOrigin = (value: string): string | null => {
  try {
    const u = new URL(value);
    return u.origin;
  } catch {
    return null;
  }
};

const safeReferrerOrigin = (): string | null => safeUrlOrigin(String(document.referrer || '').trim());

const parseAllowedParentOrigins = (): string[] => {
  const raw = String(process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS || '').trim();
  const items = raw
    ? raw
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

  const defaults = ['https://aurora.pivota.cc', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];
  return Array.from(new Set<string>([...defaults, ...items]));
};

export const isAuroraEmbedMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    const embed = (sp.get('embed') || '').trim();
    const entry = (sp.get('entry') || '').trim();
    if (embed === '1') return true;
    if (entry === 'aurora_chatbox') return true;
  } catch {
    // ignore
  }
  return false;
};

export const getAllowedParentOrigin = (): string | null => {
  if (typeof window === 'undefined') return null;
  if (window.parent === window) return null;
  const origin = safeReferrerOrigin();
  if (!origin) return null;
  const allow = parseAllowedParentOrigins();
  return allow.includes(origin) ? origin : null;
};

export const postRequestCloseToParent = (args: { reason?: string }): boolean => {
  const parentOrigin = getAllowedParentOrigin();
  if (!parentOrigin) return false;

  const msg: ShopRequestCloseMessage = {
    schema_version: SCHEMA_VERSION,
    kind: SHOP_KIND,
    event: 'request_close',
    payload: {
      occurred_at: new Date().toISOString(),
      pathname: String(window.location.pathname || ''),
      ...(args.reason ? { reason: args.reason } : {}),
    },
  };

  try {
    window.parent.postMessage(msg, parentOrigin);
    return true;
  } catch {
    return false;
  }
};

