import { describe, expect, it } from "vitest";

import { shouldAllowLegacyProductDetailBroadScan } from "./productDetailFallback";

describe("shouldAllowLegacyProductDetailBroadScan", () => {
  it("allows broad scan for external seed merchant ids", () => {
    expect(
      shouldAllowLegacyProductDetailBroadScan({
        productId: "prod_123",
        merchantId: "external_seed",
      }),
    ).toBe(true);
  });

  it("allows broad scan for ext product ids even without merchant id", () => {
    expect(
      shouldAllowLegacyProductDetailBroadScan({
        productId: "ext_ff921a71e82806843dcc67cd",
      }),
    ).toBe(true);
  });

  it("allows broad scan for creator pdp alias entry points", () => {
    expect(
      shouldAllowLegacyProductDetailBroadScan({
        productId: "prod_123",
        merchantId: "foo",
        entryPoint: "creator_pdp_alias",
      }),
    ).toBe(true);
  });

  it("keeps broad scan disabled for normal merchant-bound pdp loads", () => {
    expect(
      shouldAllowLegacyProductDetailBroadScan({
        productId: "prod_123",
        merchantId: "merch_abc",
        entryPoint: "search_results",
      }),
    ).toBe(false);
  });
});
