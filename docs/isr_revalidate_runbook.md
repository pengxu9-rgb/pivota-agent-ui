# On-demand ISR revalidation — operator runbook

`POST /api/revalidate` purges the ISR cache entry for **one** PDP.

Before this existed, a PDP that cached a wrong answer — a 404 on a product since
ungated, a stale price, a dead canonical — could only be fixed by waiting out the
`revalidate = 3600` window. It is a prerequisite for the tombstone sitemap flip:
moving a URL is not safe while the old answer can outlive the data fix by an hour.

## Setup (one-time, operator action)

| name | value | where |
|---|---|---|
| `PIVOTA_REVALIDATE_SECRET` | a long random string | Vercel → Production (and Preview if you want it usable there) |

**Until this is set the route returns 501 and purges nothing** — deliberately
inert rather than open, and non-retryable so callers do not loop against a
permanently dead endpoint.

```bash
openssl rand -hex 32   # generate
```

## Use

```bash
curl -X POST https://agent.pivota.cc/api/revalidate \
  -H 'content-type: application/json' \
  -H "x-revalidate-secret: $PIVOTA_REVALIDATE_SECRET" \
  -d '{"product_id":"sig_1b4d53ca07835e10cdaada553bc26ed6"}'
```

`Authorization: Bearer <secret>` works too.

```json
{ "revalidated": true,
  "tag": "pdp:sig_1b4d53ca07835e10cdaada553bc26ed6",
  "product_id": "sig_1b4d53ca07835e10cdaada553bc26ed6",
  "now": 1785203571822 }
```

**Read back the `tag`.** A status code cannot distinguish a real purge from a
well-formed typo; the echoed tag can.

## Responses

| status | meaning |
|---|---|
| 200 | Purged `pdp:<id>`. |
| 400 `PERCENT_ENCODED_PRODUCT_ID` | Send the id **decoded**. This is a JSON body, not a URL — nothing decodes it, and the cache entry is tagged with the decoded id, so an encoded id would purge nothing while returning success. Send `mintree:abc`, not `mintree%3Aabc`. |
| 400 `INVALID_PRODUCT_ID` | Not a single well-formed id (slash, whitespace, `..`, >128 chars, non-string). |
| 401 | Wrong or missing secret. |
| 429 `COOLDOWN` | Same id purged within 10s. `Retry-After` header carries the wait in seconds. Best-effort and per-instance — serverless instances do not share memory. |
| 501 `REVALIDATE_NOT_CONFIGURED` | `PIVOTA_REVALIDATE_SECRET` is unset. |

## Things that will surprise you

**An unknown-but-well-formed id returns 200 and purges nothing.** `layout`,
`page`, or a typo'd sig all produce a valid tag that simply matches no entry.
This is by design — the blast radius is capped by the `pdp:` **namespace**, so an
id that means nothing is inert rather than dangerous. It also means *200 is not
proof the purge hit anything*; check the echoed tag against the id you meant.

**Verify against prod, not against a local build.** All pre-merge verification
used `next start` (`FileSystemCache`). Prod is Vercel, a different cache handler
— the tag string is identical but propagation is Vercel's and is eventually
consistent. Expect `x-vercel-cache: STALE` rather than `MISS`, and a purge issued
from a *preview* deployment does not touch prod's cache. Given this codebase's
dominant defect class, "it returned 200" is not evidence:

```bash
ID=sig_1b4d53ca07835e10cdaada553bc26ed6
curl -sI "https://agent.pivota.cc/products/$ID" | grep -i x-vercel-cache   # warm it
curl -X POST https://agent.pivota.cc/api/revalidate \
  -H 'content-type: application/json' -H "x-revalidate-secret: $PIVOTA_REVALIDATE_SECRET" \
  -d "{\"product_id\":\"$ID\"}"
curl -sI "https://agent.pivota.cc/products/$ID" | grep -i x-vercel-cache   # expect STALE
```

Assert on a **changed body**, not only the header.

## Why it targets a tag and not a path

`revalidatePath` builds a string tag rather than resolving a route, so
`revalidatePath('/products/layout')` and `revalidatePath('/products','layout')`
are byte-identical — and every PDP entry carries that subtree tag. A single POST
with `product_id: "layout"` once purged all ~4,400 entries. Passing the `type`
argument looked like the fix and made the route silently inert instead. The route
now purges `pdp:<id>`, the tag the PDP attaches to its own entry
(`src/lib/api.ts:3299`), which is exact-match and cannot widen.
