import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Promotion } from "@/types/promotion";
import {
  DEMO_PRODUCTS,
  createDemoPromotion,
  listDemoPromotions,
  resetDemoPromotions,
  simulateAgentQuote,
} from "./promotionsDemoStore";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function promo(overrides: Partial<Promotion>): Promotion {
  return {
    id: "t_promo",
    merchantId: "demo_merchant_lumine",
    name: "test promo",
    type: "MULTI_BUY_DISCOUNT",
    startAt: new Date(NOW.getTime() - 86400000).toISOString(),
    endAt: new Date(NOW.getTime() + 86400000).toISOString(),
    channels: ["creator_agents"],
    scope: { global: true },
    config: { kind: "MULTI_BUY_DISCOUNT", thresholdQuantity: 1, discountPercent: 10 },
    exposeToCreators: true,
    allowedCreatorIds: [],
    humanReadableRule: "10% off",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const serum = DEMO_PRODUCTS[0]; // Lumine Glow Renewal Serum, $42, category serums
const mask = DEMO_PRODUCTS[2]; // Atelier Detox Clay Mask, $15, category masks

describe("simulateAgentQuote", () => {
  it("applies FLASH_SALE as flashPrice * qty", () => {
    const flash = promo({
      type: "FLASH_SALE",
      scope: { global: false, productIds: [serum.id] },
      config: { kind: "FLASH_SALE", flashPrice: 30, originalPrice: 42 },
    });
    const q = simulateAgentQuote(serum, 2, [flash], NOW);
    expect(q.finalTotal).toBe(60);
    expect(q.appliedPromotion?.id).toBe("t_promo");
  });

  it("never surfaces a 'deal' that raises the price (review defect 2)", () => {
    // Valid form input: flashPrice <= originalPrice, but both above the
    // product's actual price. Must NOT render as a discount.
    const raise = promo({
      type: "FLASH_SALE",
      merchantId: mask.merchantId,
      scope: { global: false, categoryIds: ["masks"] },
      config: { kind: "FLASH_SALE", flashPrice: 50, originalPrice: 60 },
    });
    const q = simulateAgentQuote(mask, 1, [raise], NOW);
    expect(q.appliedPromotion).toBeNull();
    expect(q.finalTotal).toBe(mask.price);
  });

  it("gates MULTI_BUY below its threshold", () => {
    const multi = promo({
      merchantId: mask.merchantId,
      scope: { global: false, categoryIds: ["masks"] },
      config: { kind: "MULTI_BUY_DISCOUNT", thresholdQuantity: 3, discountPercent: 20 },
    });
    expect(simulateAgentQuote(mask, 2, [multi], NOW).appliedPromotion).toBeNull();
    expect(simulateAgentQuote(mask, 3, [multi], NOW).finalTotal).toBeCloseTo(36);
  });

  it("picks the best of N applicable deals", () => {
    const small = promo({ id: "small" });
    const big = promo({
      id: "big",
      config: { kind: "MULTI_BUY_DISCOUNT", thresholdQuantity: 1, discountPercent: 50 },
    });
    const q = simulateAgentQuote(serum, 1, [small, big], NOW);
    expect(q.appliedPromotion?.id).toBe("big");
    expect(q.finalTotal).toBe(21);
  });

  it("filters by active window", () => {
    const expired = promo({ endAt: new Date(NOW.getTime() - 1000).toISOString() });
    const future = promo({ startAt: new Date(NOW.getTime() + 1000).toISOString() });
    expect(simulateAgentQuote(serum, 1, [expired, future], NOW).appliedPromotion).toBeNull();
  });

  it("matches scope by merchant, product, category, and brand", () => {
    const wrongMerchant = promo({ merchantId: "demo_merchant_atelier" });
    expect(simulateAgentQuote(serum, 1, [wrongMerchant], NOW).appliedPromotion).toBeNull();

    const byBrand = promo({ scope: { global: false, brandIds: ["Lumine"] } });
    expect(simulateAgentQuote(serum, 1, [byBrand], NOW).appliedPromotion?.id).toBe("t_promo");
  });

  it("only trusts explicit PIVOTA- codes from descriptions (review defect 3)", () => {
    const scam = promo({ description: "Great for SUMMER shoppers" });
    const q = simulateAgentQuote(serum, 1, [scam], NOW);
    expect(q.agentAppliedCode).toBe("PIVOTA-AGENT-10");

    const explicit = promo({ description: "Materialized as Shopify code PIVOTA-VIP-2026." });
    expect(simulateAgentQuote(serum, 1, [explicit], NOW).agentAppliedCode).toBe("PIVOTA-VIP-2026");
  });
});

describe("demo store persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("seeds on first read and persists creates", async () => {
    expect((await listDemoPromotions()).length).toBe(3);
    await createDemoPromotion({
      merchantId: "demo_merchant_lumine",
      name: "t",
      type: "MULTI_BUY_DISCOUNT",
      description: "",
      startAt: NOW.toISOString(),
      endAt: new Date(NOW.getTime() + 1000).toISOString(),
      channels: ["creator_agents"],
      scope: { global: true },
      config: { kind: "MULTI_BUY_DISCOUNT", thresholdQuantity: 1, discountPercent: 5 },
      exposeToCreators: true,
      allowedCreatorIds: [],
      humanReadableRule: "5% off",
    });
    expect((await listDemoPromotions()).length).toBe(4);
    expect(resetDemoPromotions().length).toBe(3);
  });

  it("falls back to seeds when storage throws (private mode)", async () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      expect((await listDemoPromotions()).length).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });
});
