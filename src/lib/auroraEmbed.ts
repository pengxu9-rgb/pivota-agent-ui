'use client';

const SCHEMA_VERSION = '0.1' as const;
const SHOP_KIND = 'pivota_shop_bridge' as const;
const PARENT_ORIGIN_STORAGE_KEY = 'aurora_embed_parent_origin_v1';

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
const safeParentOriginFromQuery = (): string | null => {
  try {
    const sp = new URLSearchParams(window.location.search);
    return (
      safeUrlOrigin(String(sp.get('parent_origin') || '').trim()) ||
      safeUrlOrigin(String(sp.get('parentOrigin') || '').trim())
    );
  } catch {
    return null;
  }
};

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
  const allow = parseAllowedParentOrigins();

  const remember = (origin: string) => {
    try {
      window.sessionStorage.setItem(PARENT_ORIGIN_STORAGE_KEY, origin);
    } catch {
      // ignore
    }
  };

  const fromQuery = safeParentOriginFromQuery();
  if (fromQuery && allow.includes(fromQuery)) {
    remember(fromQuery);
    return fromQuery;
  }

  const fromReferrer = safeReferrerOrigin();
  if (fromReferrer && allow.includes(fromReferrer)) {
    remember(fromReferrer);
    return fromReferrer;
  }

  try {
    const fromStorage = safeUrlOrigin(String(window.sessionStorage.getItem(PARENT_ORIGIN_STORAGE_KEY) || '').trim());
    if (fromStorage && allow.includes(fromStorage)) return fromStorage;
  } catch {
    // ignore
  }

  return null;
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
