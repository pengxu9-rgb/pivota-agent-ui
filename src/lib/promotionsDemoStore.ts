/**
 * Partner Preview demo store for /ops/promotions (ADR-022, pivota-backend).
 *
 * The production promotions lane was deleted end-to-end in 2026-08 — it had
 * zero production usage and could not honestly promise that a displayed deal
 * changed a charged price. This store is the deliberately self-contained
 * replacement: everything here lives in localStorage in the visitor's browser,
 * nothing touches the network, and the page it powers is badged as demo data.
 *
 * It exists to SHOW partners the target design recorded in ADR-022:
 *   merchant authors an AI-channel-exclusive deal
 *     → Pivota materializes it as a Shopify discount code
 *     → the agent presents the code at checkout
 *     → Shopify (the checkout authority) enforces it.
 * `simulateAgentQuote` below plays that loop out against demo products.
 * When a partner commits, the rebuild follows ADR-022 — this file is the
 * storyboard, not the implementation.
 */

import type { Promotion, PromotionConfig, PromotionType } from "@/types/promotion";

const STORAGE_KEY = "pivota_promotions_partner_preview_v1";

// ---------------------------------------------------------------------------
// Seed fixtures — obviously-demo merchants and products.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString();
}

function seedPromotions(): Promotion[] {
  const now = new Date().toISOString();
  return [
    {
      id: "demo_promo_agent_exclusive",
      merchantId: "demo_merchant_lumine",
      name: "AI-channel exclusive: 15% off serums",
      type: "MULTI_BUY_DISCOUNT",
      description:
        "Only offered through shopping agents — never shown on the storefront. Materialized as Shopify code PIVOTA-AGENT-15.",
      startAt: iso(-2),
      endAt: iso(12),
      channels: ["creator_agents"],
      scope: { global: false, categoryIds: ["serums"] },
      config: { kind: "MULTI_BUY_DISCOUNT", thresholdQuantity: 1, discountPercent: 15 },
      exposeToCreators: true,
      allowedCreatorIds: [],
      humanReadableRule: "Agents get 15% off any serum via code PIVOTA-AGENT-15",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "demo_promo_flash",
      merchantId: "demo_merchant_lumine",
      name: "48h flash sale: Hydra Cream",
      type: "FLASH_SALE",
      description: "Storyboard of a time-boxed price drop surfaced to agents with urgency metadata.",
      startAt: iso(-0.5),
      endAt: iso(1.5),
      channels: ["creator_agents", "web"],
      scope: { global: false, productIds: ["demo_prod_hydra_cream"] },
      config: { kind: "FLASH_SALE", flashPrice: 19, originalPrice: 28, stockLimit: 40 },
      exposeToCreators: true,
      allowedCreatorIds: [],
      humanReadableRule: "Hydra Cream $28 → $19 for 48 hours",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "demo_promo_multibuy",
      merchantId: "demo_merchant_atelier",
      name: "Buy 3, get 20% off masks",
      type: "MULTI_BUY_DISCOUNT",
      description: "Classic threshold deal, applied by the checkout authority at quote time.",
      startAt: iso(-10),
      endAt: iso(20),
      channels: ["creator_agents", "web", "app"],
      scope: { global: false, categoryIds: ["masks"] },
      config: { kind: "MULTI_BUY_DISCOUNT", thresholdQuantity: 3, discountPercent: 20 },
      exposeToCreators: true,
      allowedCreatorIds: [],
      humanReadableRule: "Buy 3 masks, get 20% off",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export interface DemoProduct {
  id: string;
  merchantId: string;
  name: string;
  category: string;
  price: number;
  currency: string;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "demo_prod_glow_serum",
    merchantId: "demo_merchant_lumine",
    name: "Glow Renewal Serum",
    category: "serums",
    price: 42,
    currency: "USD",
  },
  {
    id: "demo_prod_hydra_cream",
    merchantId: "demo_merchant_lumine",
    name: "Hydra Cream",
    category: "moisturizers",
    price: 28,
    currency: "USD",
  },
  {
    id: "demo_prod_clay_mask",
    merchantId: "demo_merchant_atelier",
    name: "Detox Clay Mask",
    category: "masks",
    price: 15,
    currency: "USD",
  },
];

// ---------------------------------------------------------------------------
// localStorage-backed CRUD (synchronous under the hood, async-shaped API so
// the page code reads like the client it replaced).
// ---------------------------------------------------------------------------

function readAll(): Promotion[] {
  if (typeof window === "undefined") return seedPromotions();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedPromotions();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Promotion[]) : seedPromotions();
  } catch {
    return seedPromotions();
  }
}

function writeAll(promotions: Promotion[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(promotions));
  } catch {
    // Quota/serialization failures are non-fatal in a demo.
  }
}

export async function listDemoPromotions(): Promise<Promotion[]> {
  return readAll();
}

export async function createDemoPromotion(
  input: Omit<Promotion, "id" | "createdAt" | "updatedAt">
): Promise<Promotion> {
  const now = new Date().toISOString();
  const promotion: Promotion = {
    ...input,
    id: `demo_promo_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
  };
  writeAll([promotion, ...readAll()]);
  return promotion;
}

export async function updateDemoPromotion(
  id: string,
  patch: Partial<Promotion>
): Promise<Promotion> {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Demo promotion not found.");
  const updated: Promotion = {
    ...all[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

export async function deleteDemoPromotion(id: string): Promise<void> {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function resetDemoPromotions(): Promotion[] {
  const seeded = seedPromotions();
  writeAll(seeded);
  return seeded;
}

// ---------------------------------------------------------------------------
// Simulated agent quote — the target loop, played out on demo data.
// ---------------------------------------------------------------------------

export interface SimulatedQuoteLine {
  label: string;
  amount: number;
}

export interface SimulatedQuote {
  product: DemoProduct;
  quantity: number;
  appliedPromotion: Promotion | null;
  /** The Shopify code the agent would present at checkout in the target design. */
  agentAppliedCode: string | null;
  lines: SimulatedQuoteLine[];
  originalTotal: number;
  finalTotal: number;
  narrative: string[];
}

function promoAppliesToProduct(promotion: Promotion, product: DemoProduct): boolean {
  if (promotion.merchantId !== product.merchantId) return false;
  const scope = promotion.scope || {};
  if (scope.global) return true;
  if (scope.productIds?.includes(product.id)) return true;
  if (scope.categoryIds?.includes(product.category)) return true;
  return false;
}

function codeForPromotion(promotion: Promotion): string {
  const match = promotion.description?.match(/[A-Z0-9][A-Z0-9-]{4,}/);
  if (match) return match[0];
  const pct =
    promotion.config.kind === "MULTI_BUY_DISCOUNT" ? promotion.config.discountPercent : "";
  return `PIVOTA-AGENT-${pct || "DEAL"}`;
}

export function simulateAgentQuote(
  product: DemoProduct,
  quantity: number,
  promotions: Promotion[],
  now: Date = new Date()
): SimulatedQuote {
  const active = promotions.filter((p) => {
    const start = new Date(p.startAt).getTime();
    const end = new Date(p.endAt).getTime();
    const t = now.getTime();
    return t >= start && t <= end && promoAppliesToProduct(p, product);
  });

  const originalTotal = product.price * quantity;
  let best: { promotion: Promotion; total: number } | null = null;

  for (const promotion of active) {
    const config: PromotionConfig = promotion.config;
    let total = originalTotal;
    if (config.kind === "FLASH_SALE") {
      total = config.flashPrice * quantity;
    } else if (config.kind === "MULTI_BUY_DISCOUNT" && quantity >= config.thresholdQuantity) {
      total = originalTotal * (1 - config.discountPercent / 100);
    } else {
      continue;
    }
    if (!best || total < best.total) best = { promotion, total };
  }

  const lines: SimulatedQuoteLine[] = [
    { label: `${product.name} × ${quantity}`, amount: originalTotal },
  ];
  const narrative = [
    `Agent asks for a quote on ${product.name} (×${quantity}).`,
  ];

  let agentAppliedCode: string | null = null;
  let finalTotal = originalTotal;

  if (best) {
    finalTotal = Math.round(best.total * 100) / 100;
    agentAppliedCode = codeForPromotion(best.promotion);
    lines.push({
      label: `Deal applied: ${best.promotion.humanReadableRule || best.promotion.name}`,
      amount: finalTotal - originalTotal,
    });
    narrative.push(
      `Index surfaces "${best.promotion.name}" as predictable for this checkout lane.`,
      `Agent presents code ${agentAppliedCode} at checkout.`,
      `Shopify — the checkout authority — enforces it: total ${product.currency} ${originalTotal.toFixed(2)} → ${product.currency} ${finalTotal.toFixed(2)}.`
    );
  } else {
    narrative.push(
      "No active deal applies — the agent quotes the plain price. Nothing is displayed that checkout would not honor."
    );
  }

  return {
    product,
    quantity,
    appliedPromotion: best?.promotion ?? null,
    agentAppliedCode,
    lines,
    originalTotal,
    finalTotal,
    narrative,
  };
}
