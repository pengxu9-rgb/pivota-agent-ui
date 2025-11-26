// Centralized API helpers for calling the Pivota Agent Gateway and Accounts API
// All UI components should import functions from here instead of using fetch directly.

// Point to the public Agent Gateway by default; override via NEXT_PUBLIC_API_URL if needed.
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  '/api/gateway'; // default to same-origin proxy to avoid CORS

// Accounts API base (for auth + orders). Defaults to production accounts endpoint.
const ACCOUNTS_BASE =
  (process.env.NEXT_PUBLIC_ACCOUNTS_BASE ||
    'https://web-production-fedb.up.railway.app/accounts').replace(/\/$/, '');

type ApiError = Error & { code?: string; status?: number; detail?: any };

// Merchant is provided via env or can be overridden at runtime (e.g., via query param / localStorage).
export function getMerchantId(overrideId?: string): string {
  if (overrideId) return overrideId;

  // Prefer runtime override stored in the browser (set via query param or user input)
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('pivota_merchant_id');
    if (stored) return stored;
  }

  // Fallback to env
  const envId = process.env.NEXT_PUBLIC_MERCHANT_ID || '';
  if (envId) return envId;

  throw new Error(
    'Missing merchant configuration (NEXT_PUBLIC_MERCHANT_ID or runtime override)',
  );
}

export function setMerchantId(merchantId: string) {
  if (typeof window !== 'undefined' && merchantId) {
    window.localStorage.setItem('pivota_merchant_id', merchantId);
  }
}

// Product shape from real API
interface RealAPIProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image_url?: string;
  product_type?: string;
  inventory_quantity: number;
  sku?: string;
  variants?: any[];
  platform?: string;
}

// Normalized product used across the UI
export interface ProductResponse {
  product_id: string;
  merchant_id?: string;
  merchant_name?: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image_url?: string;
  category?: string;
  in_stock: boolean;
}

function normalizeProduct(
  p: RealAPIProduct | ProductResponse,
): ProductResponse {
  const anyP = p as any;
  const rawPrice = anyP.price;
  let normalizedPrice = 0;

  if (typeof rawPrice === 'number') {
    normalizedPrice = rawPrice;
  } else if (typeof rawPrice === 'string') {
    normalizedPrice = Number(rawPrice) || 0;
  } else if (rawPrice && typeof rawPrice.amount === 'number') {
    normalizedPrice = rawPrice.amount;
  } else if (rawPrice && typeof rawPrice.amount === 'string') {
    normalizedPrice = Number(rawPrice.amount) || 0;
  }

  // Fallback: try variant price when main price is missing/zero
  if (
    normalizedPrice <= 0 &&
    Array.isArray(anyP.variants) &&
    anyP.variants.length > 0
  ) {
    const variantWithPrice = anyP.variants.find(
      (v: any) => typeof v?.price !== 'undefined',
    );
    const variantPrice = variantWithPrice?.price;
    if (typeof variantPrice === 'number') {
      normalizedPrice = variantPrice;
    } else if (typeof variantPrice === 'string') {
      normalizedPrice = Number(variantPrice) || normalizedPrice;
    }
  }

  const normalizedCurrency =
    anyP.currency ||
    rawPrice?.currency ||
    rawPrice?.currency_code ||
    'USD';

  let normalizedImage =
    anyP.image_url ||
    anyP.image ||
    (Array.isArray(anyP.images) ? anyP.images[0] : undefined) ||
    (Array.isArray(anyP.variants) ? anyP.variants[0]?.image_url : undefined);

  // Use image proxy for external images to avoid CORS issues
  if (normalizedImage && (normalizedImage.includes('amazon') || normalizedImage.includes('http'))) {
    normalizedImage = `/api/image-proxy?url=${encodeURIComponent(normalizedImage)}`;
  }

  const description =
    typeof anyP.description === 'string'
      ? anyP.description
      : anyP.description?.text || '';

  return {
    product_id: anyP.product_id || anyP.id,
    merchant_id:
      anyP.merchant_id ||
      anyP.merchant?.id ||
      anyP.merchant_uuid ||
      anyP.store_id,
    merchant_name: anyP.merchant_name || anyP.store_name,
    title: anyP.title || anyP.name || 'Untitled product',
    description,
    price: normalizedPrice,
    currency: normalizedCurrency,
    image_url: normalizedImage,
    category: anyP.category || anyP.product_type || 'General',
    in_stock:
      typeof anyP.in_stock === 'boolean'
        ? anyP.in_stock
        : (anyP.inventory_quantity ||
            anyP.quantity ||
            anyP.stock ||
            0) > 0,
  };
}

interface InvokeBody {
  operation: string;
  payload: any;
}

async function callGateway(body: InvokeBody) {
  // If API_BASE is our same-origin proxy (/api/gateway), hit it directly; otherwise append the invoke path.
  const isProxy = API_BASE.startsWith('/api/gateway');
  const url = isProxy ? API_BASE : `${API_BASE}/agent/shop/v1/invoke`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as any).message ||
        `Gateway error: ${res.status} ${res.statusText}`,
    );
  }

  return res.json();
}

// -------- Accounts API helpers --------

async function callAccounts(
  path: string,
  options: RequestInit & { skipJson?: boolean } = {},
) {
  const url = `${ACCOUNTS_BASE}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    credentials: 'include', // rely on HttpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body,
  });

  if (options.skipJson) {
    return res;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code =
      (data as any)?.detail?.error?.code ||
      (data as any)?.error?.code ||
      undefined;
    const message =
      (data as any)?.detail?.error?.message ||
      (data as any)?.error?.message ||
      res.statusText;
    const err = new Error(message) as ApiError;
    err.code = code;
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

// -------- Product search helpers --------

// Chat entrypoint: search products by free text query with graceful fallback
export async function sendMessage(
  message: string,
  merchantIdOverride?: string,
): Promise<ProductResponse[]> {
  const query = message.trim();

  const data = await callGateway({
    operation: 'find_products_multi',
    payload: {
      search: {
        // Cross-merchant search; backend will route across merchants
        in_stock_only: false, // allow showing results even if inventory is zero for demo
        query,
        limit: 10,
      },
    },
  });

  let products = ((data as any).products || []).map(
    (p: RealAPIProduct | ProductResponse) => normalizeProduct(p),
  );

  // Fallback: if gateway search returns no products for a non-empty query,
  // run a broader local filter over the general catalog so common queries
  // like "tee" can still surface relevant items.
  if (!products.length && query) {
    try {
      const all = await getAllProducts(50);
      const term = query.toLowerCase();
      const fallback = all.filter((p) => {
        const title = (p.title || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        return (
          title.includes(term) ||
          desc.includes(term) ||
          category.includes(term)
        );
      });
      if (fallback.length) {
        products = fallback;
      } else if (all.length) {
        // As a last resort, if we still don't have any matches but the catalog
        // itself has products, return a generic set of recommendations instead
        // of an empty list so the user always sees something useful.
        products = all;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Fallback product search error:', err);
    }
  }

  return products;
}

// Generic product list (Hot Deals, history, etc.)
export async function getAllProducts(
  limit = 20,
  merchantIdOverride?: string,
): Promise<ProductResponse[]> {
  // If we have a merchant id, use single-merchant search; otherwise fallback to multi.
  let merchantId: string | undefined = merchantIdOverride;
  if (!merchantId) {
    try {
      merchantId = getMerchantId();
    } catch (e) {
      merchantId = undefined;
    }
  }

  const searchPayload = {
    search: {
      in_stock_only: false,
      query: '',
      limit,
      ...(merchantId ? { merchant_id: merchantId } : {}),
    },
  };

  const data = await callGateway({
    operation: merchantId ? 'find_products' : 'find_products_multi',
    payload: searchPayload as any,
  });

  const products = (data as any).products || [];
  return products.map((p: RealAPIProduct | ProductResponse) =>
    normalizeProduct(p),
  );
}

// Single product detail
export async function getProductDetail(
  productId: string,
  merchantIdOverride?: string,
): Promise<ProductResponse | null> {
  // Try to resolve merchant_id, fallback to cross-merchant search if missing.
  let merchantId: string | undefined = merchantIdOverride;
  if (!merchantId) {
    try {
      merchantId = getMerchantId();
    } catch (e) {
      // ignore, will fallback
    }
  }

  try {
    if (merchantId) {
      const data = await callGateway({
        operation: 'get_product_detail',
        payload: {
          product: {
            merchant_id: merchantId,
            product_id: productId,
          },
        },
      });

      const product = (data as any).product;
      if (product) {
        return normalizeProduct(product);
      }
    }
  } catch (err) {
    // In MOCK mode or when backend returns 404, gracefully fall back to list search
    console.error('getProductDetail primary error, falling back to list:', err);
  }

  try {
    // Fallback: cross-merchant search to locate the product and its merchant_id
    const searchAndFind = async (query: string, limit = 500) => {
      const data = await callGateway({
        operation: 'find_products_multi',
        payload: {
          search: {
            query,
            limit,
          },
        },
      });
      const products: ProductResponse[] = ((data as any).products || []).map(
        (p: RealAPIProduct | ProductResponse) => normalizeProduct(p) as ProductResponse,
      );
      return products.find((p: ProductResponse) => p.product_id === productId);
    };

    // Try broad fetch then targeted by productId
    let found = await searchAndFind('', 500);
    if (!found) {
      found = await searchAndFind(productId, 500);
    }

    if (found && found.merchant_id) {
      try {
        const detail = await callGateway({
          operation: 'get_product_detail',
          payload: {
            product: {
              merchant_id: found.merchant_id,
              product_id: productId,
            },
          },
        });
        const product = (detail as any).product;
        if (product) return normalizeProduct(product);
      } catch (e) {
        console.error('Fallback detail fetch failed:', e);
        return found;
      }
    }
    return found || null;
  } catch (err) {
    console.error('getProductDetail fallback error:', err);
    return null;
  }
}

// -------- Order & payment helpers --------

export async function createOrder(orderData: {
  merchant_id: string;
  customer_email: string;
  items: Array<{
    merchant_id: string;
    product_id: string;
    product_title: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  shipping_address: {
    name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    country: string;
    postal_code: string;
    phone?: string;
  };
  customer_notes?: string;
}) {
  const data = await callGateway({
    operation: 'create_order',
    payload: {
      order: orderData,
    },
  });

  return data;
}

export async function processPayment(paymentData: {
  order_id: string;
  total_amount: number;
  currency: string;
  payment_method: {
    type: string;
  };
  return_url?: string;
}) {
  const data = await callGateway({
    operation: 'submit_payment',
    payload: {
      payment: {
        order_id: paymentData.order_id,
        expected_amount: paymentData.total_amount,
        currency: paymentData.currency,
        payment_method_hint: paymentData.payment_method.type,
        ...(paymentData.return_url && { return_url: paymentData.return_url }),
      },
    },
  });

  return data;
}

export async function getOrderStatus(orderId: string) {
  const data = await callGateway({
    operation: 'get_order_status',
    payload: {
      order: { order_id: orderId },
    },
  });

  return data;
}


// -------- Accounts API: Auth & Orders --------

export interface AccountsUser {
  id: string;
  email: string | null;
  phone: string | null;
  primary_role: string;
  is_guest: boolean;
}

export interface Membership {
  merchant_id: string;
  role: string;
}

type OrdersPermissions = {
  can_pay: boolean;
  can_cancel: boolean;
  can_reorder: boolean;
};

type OrdersListItem = {
  order_id: string;
  currency: string;
  total_amount_minor: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  delivery_status: string;
  created_at: string;
  shipping_city?: string | null;
  shipping_country?: string | null;
  items_summary?: string;
  permissions?: OrdersPermissions;
};

export async function accountsLogin(email: string) {
  return callAccounts('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ channel: 'email', email }),
  });
}

export async function accountsVerify(email: string, otp: string) {
  return callAccounts('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ channel: 'email', email, otp }),
  });
}

export async function accountsMe() {
  return callAccounts('/auth/me');
}

export async function accountsRefresh() {
  return callAccounts('/auth/refresh', { method: 'POST' });
}

export async function accountsLogout() {
  return callAccounts('/auth/logout', { method: 'POST' });
}

export async function listMyOrders(cursor?: string | null, limit = 20) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  return callAccounts(`/orders/list?${params.toString()}`);
}

export async function getAccountOrder(orderId: string) {
  return callAccounts(`/orders/${orderId}`);
}

export async function publicOrderLookup(orderId: string, email: string) {
  const params = new URLSearchParams({ order_id: orderId, email });
  return callAccounts(`/public/order-lookup?${params.toString()}`);
}

export async function publicOrderTrack(orderId: string, email: string) {
  const params = new URLSearchParams({ order_id: orderId, email });
  return callAccounts(`/public/track?${params.toString()}`);
}
