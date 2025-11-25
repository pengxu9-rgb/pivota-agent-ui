# Accounts & Orders API Contract (Client-Facing)

Scope: login/verify/session, protected orders list/detail, public order lookup/track. Amounts use minor units (e.g., cents). Times use ISO8601 strings with timezone (`2025-11-25T10:00:00Z`).

## Auth

- `/auth/login` (POST)  
  Body: `{ "channel": "email"|"sms", "email"?: string, "phone"?: string }`  
  Rules: exactly one of email/phone, must match channel; else `INVALID_INPUT`.  
  Resp: `{ "status": "sent" }` or `RATE_LIMITED|INVALID_INPUT|SERVER_ERROR`.

- `/auth/verify` (POST)  
  Body: `{ "channel": "email"|"sms", "email"?: string, "phone"?: string, "otp": string }` (same one-of rule).  
  Resp:
  ```json
  {
    "user": { "id": "u_123", "email": "a@b.com", "phone": "+86...", "primary_role": "customer|merchant_staff|admin", "is_guest": false },
    "memberships": [{ "merchant_id": "m1", "role": "owner" }],
    "active_merchant_id": "m1",
    "is_new_user": false,
    "has_claimable_orders": true
  }
  ```
  Tokens: access (short) + refresh (long) in HttpOnly cookies.  
  Errors: `INVALID_OTP`, `INVALID_INPUT`, `RATE_LIMITED`, `SERVER_ERROR`.

- `/auth/me` (GET)  
  Reads cookies, returns same shape as verify (without tokens). 401 → `UNAUTHENTICATED`.

- `/auth/refresh` (POST, recommended)  
  Reads refresh cookie → issues new access cookie. Resp `{ "status": "ok" }` or 401/403/500.

- `/auth/logout` (POST)  
  Clears cookies. Resp `{ "status": "ok" }`.

Error codes (auth + shared): `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `INVALID_OTP`, `RATE_LIMITED`, `SERVER_ERROR`.

## Orders (Protected)

### Permission model
- Customer: `order.user_id == current_user_id` (or email claimed to that user).
- Merchant: membership contains `order.merchant_id` with `view_orders`. Optional `merchant_id` filter applies only for merchant users; ignored for customers.
- Anonymous: blocked → use public lookup.
- `/orders/{id}` uses `order_id` (business ID) in path, not DB PK.

### Status enums
- `status` (summary): `pending|paid|shipped|completed|cancelled|refunded` (derived from payment/fulfillment).
- `payment_status`: `pending|paid|refunded|failed|partial`.
- `fulfillment_status`: `not_fulfilled|partially_fulfilled|fulfilled|returned`.
- `delivery_status`: `not_shipped|in_transit|delivered|exception`.

### Amounts
All monetary fields are integer minor units: `*_minor` (e.g., 5900 = $59.00).

### /orders/list (GET)
- Params: `cursor`, `limit` (default 20, max 100), `status`, `payment_status`, `fulfillment_status`, `from`, `to` (ISO8601; clarify whether inclusive `[from,to]` or `[from,to)`, default include full days), `q` (order_id / item title / recipient name / phone last4, max 100 chars, trimmed), optional `merchant_id` (merchant users only). Sort: `created_at DESC`.
- Resp:
```json
{
  "orders": [{
    "order_id": "ORD_x",
    "currency": "USD",
    "total_amount_minor": 5900,
    "status": "paid",
    "payment_status": "paid",
    "fulfillment_status": "not_fulfilled",
    "delivery_status": "not_shipped",
    "created_at": "2025-11-25T10:00:00Z",
    "shipping_city": "NY",
    "shipping_country": "US",
    "items_summary": "Hoodie x1",
    "permissions": { "can_pay": false, "can_cancel": false, "can_reorder": true }
  }],
  "next_cursor": "...",
  "has_more": true
}
```
- Errors: 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 400 `INVALID_INPUT` (e.g., q too long).

### /orders/{order_id} (GET)
- Path param is the external `order_id`.  
- Resp:
```json
{
  "order": {
    "order_id": "ORD_x",
    "merchant_id": "m1",
    "currency": "USD",
    "total_amount_minor": 5900,
    "status": "paid",
    "payment_status": "paid",
    "fulfillment_status": "not_fulfilled",
    "delivery_status": "not_shipped",
    "created_at": "2025-11-25T10:00:00Z",
    "updated_at": "2025-11-25T12:00:00Z",
    "shipping_address": {
      "name": "John Doe",
      "city": "NY",
      "country": "US",
      "postal_code": "10001"
    }
  },
  "items": [{
    "product_id": "101",
    "title": "Hoodie",
    "quantity": 1,
    "unit_price_minor": 5900,
    "subtotal_minor": 5900,
    "sku": "SKU1",
    "merchant_id": "m1"
  }],
  "payment": {
    "records": [{
      "payment_id": "pay_123",
      "provider": "stripe",
      "amount_minor": 5900,
      "currency": "USD",
      "status": "succeeded",
      "payment_intent_id": "pi_x"
    }]
  },
  "fulfillment": {
    "shipments": [{
      "tracking_number": "SF123",
      "carrier": "SF",
      "status": "in_transit",
      "estimated_delivery": "2025-11-30T00:00:00Z",
      "events": [{
        "status": "ordered",
        "timestamp": "2025-11-25T10:00:00Z",
        "description": "Order placed",
        "completed": true
      }]
    }]
  },
  "customer": { "email": "a@b.com", "phone": "+1***1234", "name": "John Doe" },
  "permissions": { "can_pay": false, "can_cancel": false, "can_reorder": true }
}
```
- Errors: for “not found or no access” always `404 NOT_FOUND` with message “Order not found”; only structural misuse returns 403.

## Public Lookup (Minimal Exposure)

Rules: require `order_id + email` (server normalizes email: lowercase, trim; may hash). Rate limit by IP and (email, order_id).  
`status` uses same summary enum as protected orders: `pending|paid|shipped|completed|cancelled|refunded`.  
NOT_FOUND/MISMATCH unified:
```json
{ "error": { "code": "NOT_FOUND", "message": "Order not found or email mismatch" } }
```

- `/public/order-lookup` (GET)  
  Params: `order_id`, `email`.  
  Resp:
  ```json
  {
    "order_id": "ORD_x",
    "status": "paid",
    "currency": "USD",
    "total_amount_minor": 5900,
    "created_at": "2025-11-25T10:00:00Z",
    "items_summary": "Hoodie x1",
    "shipping": { "city": "NY", "country": "US" },
    "customer": { "name": "John D.", "masked_email": "a***@gmail.com" }
  }
  ```
- `/public/track` (GET)  
  Params: `order_id`, `email`.  
  Resp:
  ```json
  {
    "order_id": "ORD_x",
    "delivery_status": "not_shipped",
    "timeline": [
      { "status": "ordered", "timestamp": "2025-11-25T10:00:00Z", "completed": true },
      { "status": "paid", "timestamp": "2025-11-25T10:02:00Z", "completed": true }
    ]
  }
  ```
- Rate limit example: same IP ≤10/min; same (email, order_id) ≤3/min → `RATE_LIMITED`.

## Frontend Expectations
- AuthProvider loads `/auth/me` on mount; manages `loading/authenticated/unauthenticated`; unified 401 handling.  
- Routes: `/login`, `/my-orders`, `/orders/:order_id` (protected), `/track` (public order lookup).  
- Agent 401/403 payload: `{ "error": { "code": "UNAUTHENTICATED|FORBIDDEN", "message": "..." } }` for LLM hints.

## Schema Notes (storage)
- Users: unique email; guests flagged by `is_guest`.
- Memberships: unique (user_id, merchant_id).
- Orders: `order_id` unique; store `customer_email_normalized/hash`; monetary fields use `_minor`; include address fields (city/country/state/postal_code/line1/line2).
- order_items/payments use `_minor` for amounts.
- shipments.status mirrors latest shipment_events.status; events status enum aligns with delivery_status subset (`not_shipped|in_transit|delivered|exception`).
