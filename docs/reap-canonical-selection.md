# Selected Reap cart preparation

The checkout panel prepares a numeric selected cart variant through
`POST /api/reap-checkout/prepare` before saving its original create body, key and
fingerprint. This route uses the same existing buyer, host, origin, server-only
credentials and pilot scope guards as checkout. It calls only the read-only
gateway preparation tool and returns a strict canonical selection record.
Preparation never creates a checkout or renews the original four-hour cookie.

The browser persists the selection with the opaque attempt, excluding contact
and address data. The original canonical SKU, variant, amount, quantity, market,
seller and source remain part of the original request fingerprint. The gateway
revalidates the data against current server authority before its sole first
checkout POST; browser values never establish eligibility or proof.

After an uncertain create, the panel reuses the stored original selection and
key for read-only recovery. It never prepares again or changes the original
selection to the current PDP/default/source. Legacy attempts retain their
original request shape. Preparation failure creates no attempt and offers no
other checkout or storefront path. Flags and hosted pilot activation remain off
by default.
