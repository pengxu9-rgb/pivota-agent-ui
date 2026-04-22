#!/usr/bin/env bash
set -euo pipefail

# Smoke test for the shopping web -> /api/ucp/checkout-sessions adapter.
#
# Usage:
#   FRONTEND_BASE_URL=http://localhost:3011 \
#   bash scripts/smoke_ucp_checkout_adapter.sh
#
# Optional:
#   PROFILE_URL=https://ucp-web.example.com/_dev/platform-profile.json
#     Force the adapter to send UCP-Agent: profile="..." via ucp_agent_profile_url.
#   EXPECT_ELIGIBLE_MODE=success|ucp_unavailable
#     Default is "success". Use "ucp_unavailable" only when intentionally checking the
#     current failure mode before enabling UCP_ALLOW_MISSING_UCP_AGENT or UCP_AGENT_PROFILE_URL.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
if [[ "${SKIP_DOTENV:-0}" != "1" && -f "${REPO_DIR}/.env.local" ]]; then
  set -a
  . "${REPO_DIR}/.env.local"
  set +a
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-http://localhost:3000}"
PROFILE_URL="${PROFILE_URL:-}"
EXPECT_ELIGIBLE_MODE="${EXPECT_ELIGIBLE_MODE:-success}"

RETURN_URL="${RETURN_URL:-/products?q=ucp-smoke}"
ENTRY="${ENTRY:-shopping_agent}"
SOURCE="${SOURCE:-shopping_agent}"
PRODUCT_ID="${PRODUCT_ID:-ucp_smoke_prod_1}"
VARIANT_ID="${VARIANT_ID:-ucp_smoke_var_1}"
MERCHANT_ID="${MERCHANT_ID:-merch_ucp_smoke}"
TITLE="${TITLE:-UCP Adapter Smoke Product}"
IMAGE_URL="${IMAGE_URL:-https://cdn.example.com/ucp-adapter-smoke.png}"
UNIT_PRICE="${UNIT_PRICE:-28}"
CURRENCY="${CURRENCY:-USD}"

MULTI_PRODUCT_ID_1="${MULTI_PRODUCT_ID_1:-multi_prod_1}"
MULTI_PRODUCT_ID_2="${MULTI_PRODUCT_ID_2:-multi_prod_2}"
MULTI_MERCHANT_ID_1="${MULTI_MERCHANT_ID_1:-multi_merch_1}"
MULTI_MERCHANT_ID_2="${MULTI_MERCHANT_ID_2:-multi_merch_2}"

export PROFILE_URL
export RETURN_URL ENTRY SOURCE
export PRODUCT_ID VARIANT_ID MERCHANT_ID TITLE IMAGE_URL UNIT_PRICE CURRENCY
export MULTI_PRODUCT_ID_1 MULTI_PRODUCT_ID_2 MULTI_MERCHANT_ID_1 MULTI_MERCHANT_ID_2

echo "== 0) adapter target =="
echo "frontend_base_url=${FRONTEND_BASE_URL}"
echo "profile_url=${PROFILE_URL:-<server default / missing-agent mode>}"
echo "expect_eligible_mode=${EXPECT_ELIGIBLE_MODE}"

ELIGIBLE_PAYLOAD="$(python3 - <<'PY'
import json, os
payload = {
    "items": [
        {
            "product_id": os.environ["PRODUCT_ID"],
            "variant_id": os.environ["VARIANT_ID"],
            "merchant_id": os.environ["MERCHANT_ID"],
            "title": os.environ["TITLE"],
            "quantity": 1,
            "unit_price": float(os.environ["UNIT_PRICE"]),
            "currency": os.environ["CURRENCY"],
            "image_url": os.environ["IMAGE_URL"],
        }
    ],
    "return_url": os.environ["RETURN_URL"],
    "entry": os.environ["ENTRY"],
    "source": os.environ["SOURCE"],
}
profile = os.environ.get("PROFILE_URL", "").strip()
if profile:
    payload["ucp_agent_profile_url"] = profile
print(json.dumps(payload))
PY
)"

echo "== 1) eligible single-merchant create =="
ELIGIBLE_RESP="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/ucp/checkout-sessions" \
  -H 'content-type: application/json' \
  --data-binary "${ELIGIBLE_PAYLOAD}")"
printf '%s\n' "${ELIGIBLE_RESP}"

ELIGIBLE_SESSION_ID="$(printf '%s' "${ELIGIBLE_RESP}" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("checkoutSessionId") or "").strip())')"
ELIGIBLE_FALLBACK="$(printf '%s' "${ELIGIBLE_RESP}" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("fallbackReason") or "").strip())')"

if [[ "${EXPECT_ELIGIBLE_MODE}" == "success" ]]; then
  if [[ -z "${ELIGIBLE_SESSION_ID}" ]]; then
    echo "ERROR: eligible cart did not produce checkoutSessionId" >&2
    exit 2
  fi
  if [[ -n "${ELIGIBLE_FALLBACK}" ]]; then
    echo "ERROR: eligible cart unexpectedly fell back (${ELIGIBLE_FALLBACK})" >&2
    exit 2
  fi

  DETAIL_FILE="${TMP_DIR}/eligible_detail.json"
  curl -fsS "${FRONTEND_BASE_URL}/ucp/v1/checkout-sessions/${ELIGIBLE_SESSION_ID}" > "${DETAIL_FILE}"
  python3 - "${DETAIL_FILE}" <<'PY'
import json, os, sys
with open(sys.argv[1], "rb") as f:
    body = json.load(f)
items = (((body.get("pivota") or {}).get("ui") or {}).get("items") or [])
assert items, body
assert items[0]["product_id"] == os.environ["PRODUCT_ID"], body
assert items[0]["merchant_id"] == os.environ["MERCHANT_ID"], body
print("✓ eligible cart created a UCP session and hydrated pivota.ui")
PY
else
  ELIGIBLE_FILE="${TMP_DIR}/eligible_response.json"
  printf '%s' "${ELIGIBLE_RESP}" > "${ELIGIBLE_FILE}"
  python3 - "${ELIGIBLE_FILE}" <<'PY'
import json, sys
with open(sys.argv[1], "rb") as f:
    body = json.load(f)
assert body.get("checkoutSessionId") in ("", None), body
assert body.get("fallbackReason") == "ucp_unavailable", body
print("✓ eligible cart reports ucp_unavailable as expected")
PY
fi

echo "== 2) multi-merchant fallback =="
MULTI_PAYLOAD="$(python3 - <<'PY'
import json, os
print(json.dumps({
    "items": [
        {
            "product_id": os.environ["MULTI_PRODUCT_ID_1"],
            "merchant_id": os.environ["MULTI_MERCHANT_ID_1"],
            "title": "Multi Merchant 1",
            "quantity": 1,
            "unit_price": 10,
            "currency": os.environ["CURRENCY"],
        },
        {
            "product_id": os.environ["MULTI_PRODUCT_ID_2"],
            "merchant_id": os.environ["MULTI_MERCHANT_ID_2"],
            "title": "Multi Merchant 2",
            "quantity": 1,
            "unit_price": 20,
            "currency": os.environ["CURRENCY"],
        },
    ],
    "return_url": os.environ["RETURN_URL"],
}))
PY
)"

MULTI_RESP="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/ucp/checkout-sessions" \
  -H 'content-type: application/json' \
  --data-binary "${MULTI_PAYLOAD}")"
printf '%s\n' "${MULTI_RESP}"

MULTI_FILE="${TMP_DIR}/multi_response.json"
printf '%s' "${MULTI_RESP}" > "${MULTI_FILE}"
python3 - "${MULTI_FILE}" <<'PY'
import json, sys
with open(sys.argv[1], "rb") as f:
    body = json.load(f)
assert body.get("checkoutSessionId") in ("", None), body
assert body.get("fallbackReason") == "multi_merchant", body
print("✓ multi-merchant cart falls back explicitly")
PY
