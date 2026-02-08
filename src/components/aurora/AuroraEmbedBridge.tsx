'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { useCartStore } from '@/store/cartStore';

const SCHEMA_VERSION = '0.1' as const;
const SHOP_KIND = 'pivota_shop_bridge' as const;
const AURORA_KIND = 'aurora_shop_bridge' as const;

type ShopBridgeEnvelope<TEvent extends string, TPayload> = {
  schema_version: typeof SCHEMA_VERSION;
  kind: typeof SHOP_KIND;
  event: TEvent;
  payload: TPayload;
};

type AuroraBridgeEnvelope<TEvent extends string, TPayload> = {
  schema_version: typeof SCHEMA_VERSION;
  kind: typeof AURORA_KIND;
  event: TEvent;
  payload: TPayload;
};

type CartItemSnapshot = {
  id: string;
  product_id?: string;
  variant_id?: string;
  sku?: string;
  merchant_id?: string;
  offer_id?: string;
  title: string;
  price: number;
  currency?: string;
  quantity: number;
  image_url?: string;
};

type CartSnapshot = {
  item_count: number;
  updated_at: string;
  items: CartItemSnapshot[];
};

type OrderSuccessPayload = {
  order_id: string;
  occurred_at: string;
  seller_name?: string | null;
  seller_domain?: string | null;
  ucp_checkout_session_id?: string | null;
  has_save_token?: boolean;
};

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

  const defaults = [
    'https://aurora.pivota.cc',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
  ];

  const set = new Set<string>([...defaults, ...items]);
  return Array.from(set);
};

const isObject = (v: unknown): v is Record<string, any> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const isAuroraEnvelope = (input: unknown): input is AuroraBridgeEnvelope<string, any> => {
  if (!isObject(input)) return false;
  if (input.schema_version !== SCHEMA_VERSION) return false;
  if (input.kind !== AURORA_KIND) return false;
  if (typeof input.event !== 'string' || !input.event.trim()) return false;
  if (!('payload' in input)) return false;
  return true;
};

const buildCartSnapshot = (): CartSnapshot => {
  const state = useCartStore.getState();
  const itemsRaw = Array.isArray(state.items) ? state.items : [];
  const items: CartItemSnapshot[] = itemsRaw
    .slice(0, 40)
    .map((it: any) => ({
      id: String(it?.id || '').trim(),
      product_id: String(it?.product_id || '').trim() || undefined,
      variant_id: String(it?.variant_id || '').trim() || undefined,
      sku: String(it?.sku || '').trim() || undefined,
      merchant_id: String(it?.merchant_id || '').trim() || undefined,
      offer_id: String(it?.offer_id || '').trim() || undefined,
      title: String(it?.title || '').trim() || String(it?.id || '').trim() || 'Item',
      price: Number(it?.price) || 0,
      currency: String(it?.currency || '').trim() || undefined,
      quantity: Number(it?.quantity) || 1,
      image_url: String(it?.imageUrl || it?.image_url || '').trim() || undefined,
    }))
    .filter((it) => Boolean(it.id));

  const item_count = items.reduce((acc, it) => acc + Math.max(0, Number(it.quantity) || 0), 0);

  return {
    item_count,
    updated_at: new Date().toISOString(),
    items,
  };
};

const consumeOpenCartParam = () => {
  // Allow parent to deep-link cart without requiring the bridge to be enabled.
  // This is safe even when loaded standalone; it does not leak any data.
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('open') !== 'cart') return;
    useCartStore.getState().open();
    sp.delete('open');
    const next = sp.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', url);
  } catch {
    // ignore
  }
};

export default function AuroraEmbedBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastCartSigRef = useRef<string>('');
  const lastOrderSentRef = useRef<string>('');

  const parentOrigin = useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (window.parent === window) return null;
    const origin = safeReferrerOrigin();
    if (!origin) return null;
    const allow = parseAllowedParentOrigins();
    return allow.includes(origin) ? origin : null;
  }, []);

  useEffect(() => {
    consumeOpenCartParam();
  }, []);

  useEffect(() => {
    if (!parentOrigin) return;

    const post = <TEvent extends string, TPayload>(event: TEvent, payload: TPayload) => {
      const msg: ShopBridgeEnvelope<TEvent, TPayload> = {
        schema_version: SCHEMA_VERSION,
        kind: SHOP_KIND,
        event,
        payload,
      };
      try {
        window.parent.postMessage(msg, parentOrigin);
      } catch {
        // ignore
      }
    };

    post('ready', {
      occurred_at: new Date().toISOString(),
      pathname: String(window.location.pathname || ''),
    });

    const emitCart = () => {
      const snap = buildCartSnapshot();
      const sig = JSON.stringify([snap.item_count, snap.items.map((it) => [it.id, it.quantity])]);
      if (sig === lastCartSigRef.current) return;
      lastCartSigRef.current = sig;
      post('cart_snapshot', snap);
    };

    emitCart();

    const unsubscribe = useCartStore.subscribe((state, prev) => {
      if (state.items === prev.items) return;
      emitCart();
    });

    const onMessage = (evt: MessageEvent) => {
      if (evt.origin !== parentOrigin) return;
      const data = evt.data;
      if (!isAuroraEnvelope(data)) return;
      if (data.event === 'open_cart') {
        try {
          useCartStore.getState().open();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('message', onMessage);

    return () => {
      unsubscribe();
      window.removeEventListener('message', onMessage);
    };
  }, [parentOrigin]);

  useEffect(() => {
    if (!parentOrigin) return;
    if (pathname !== '/order/success') return;

    const orderId =
      (searchParams.get('orderId') ||
        searchParams.get('order_id') ||
        searchParams.get('orderID') ||
        searchParams.get('order') ||
        '').trim() || null;

    if (!orderId) return;
    if (lastOrderSentRef.current === orderId) return;
    lastOrderSentRef.current = orderId;

    const payload: OrderSuccessPayload = {
      order_id: orderId,
      occurred_at: new Date().toISOString(),
      seller_name: (searchParams.get('seller_name') || searchParams.get('sellerName') || '').trim() || null,
      seller_domain: (searchParams.get('seller_domain') || searchParams.get('sellerDomain') || '').trim() || null,
      ucp_checkout_session_id:
        (searchParams.get('ucp_checkout_session_id') || searchParams.get('ucpCheckoutSessionId') || '').trim() || null,
      has_save_token: Boolean((searchParams.get('save_token') || '').trim()),
    };

    const msg: ShopBridgeEnvelope<'order_success', OrderSuccessPayload> = {
      schema_version: SCHEMA_VERSION,
      kind: SHOP_KIND,
      event: 'order_success',
      payload,
    };

    try {
      window.parent.postMessage(msg, parentOrigin);
    } catch {
      // ignore
    }
  }, [parentOrigin, pathname, searchParams]);

  return null;
}
