export type PromotionType = 'FLASH_SALE' | 'MULTI_BUY_DISCOUNT';
export type Channel = 'web' | 'app' | 'creator_agents';

export interface PromotionScope {
  merchantIds?: string[];
  productIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  global?: boolean;
}

export interface PromotionConfigFlashSale {
  kind: 'FLASH_SALE';
  flashPrice: number;
  originalPrice: number;
  stockLimit?: number;
}

export interface PromotionConfigMultiBuy {
  kind: 'MULTI_BUY_DISCOUNT';
  thresholdQuantity: number;
  discountPercent: number;
}

export type PromotionConfig = PromotionConfigFlashSale | PromotionConfigMultiBuy;

export interface Promotion {
  id: string;
  merchantId: string;

  name: string;
  type: PromotionType;
  description?: string;
  startAt: string;
  endAt: string;
  channels: Channel[];
  scope: PromotionScope;
  config: PromotionConfig;

  exposeToCreators: boolean;
  allowedCreatorIds?: string[];

  humanReadableRule: string;
  createdAt: string;
  updatedAt: string;
}

export type PromotionStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';

export function computePromotionStatus(
  promotion: Promotion,
  now: Date = new Date()
): PromotionStatus {
  const start = new Date(promotion.startAt).getTime();
  const end = new Date(promotion.endAt).getTime();
  const t = now.getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return 'ENDED';
  if (t < start) return 'UPCOMING';
  if (t > end) return 'ENDED';
  return 'ACTIVE';
}
