const PRODUCT_ROUTE_LOADING_ID = 'pivota-product-route-loading';

function ensureLoadingStyles() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(PRODUCT_ROUTE_LOADING_ID);
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = PRODUCT_ROUTE_LOADING_ID;
  overlay.setAttribute(
    'style',
    [
      'position:fixed',
      'inset:0',
      'z-index:9999',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(11,15,25,0.45)',
      'backdrop-filter:blur(2px)',
      '-webkit-backdrop-filter:blur(2px)',
      'pointer-events:none',
    ].join(';'),
  );

  const badge = document.createElement('div');
  badge.setAttribute(
    'style',
    [
      'padding:10px 16px',
      'border-radius:999px',
      'font-size:14px',
      'font-weight:600',
      'color:#111827',
      'background:rgba(255,255,255,0.92)',
      'box-shadow:0 10px 35px rgba(0,0,0,0.2)',
    ].join(';'),
  );
  badge.textContent = 'Loading product...';

  overlay.appendChild(badge);
  document.body.appendChild(overlay);
}

export function showProductRouteLoading() {
  ensureLoadingStyles();
}

export function hideProductRouteLoading() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(PRODUCT_ROUTE_LOADING_ID);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
}
