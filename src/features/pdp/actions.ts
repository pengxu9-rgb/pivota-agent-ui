import type { ActionTarget, Variant } from '@/features/pdp/types';

type ActionContext = {
  variant?: Variant;
  quantity?: number;
  onAddToCart?: (args: { variant: Variant; quantity: number }) => void;
  onBuyNow?: (args: { variant: Variant; quantity: number }) => void;
  onSelectVariant?: (variantId: string) => void;
  onOpenEmbed?: (target: ActionTarget) => void;
};

export function dispatchPdpAction(
  actionType: 'add_to_cart' | 'buy_now' | 'select_variant' | 'open_embed',
  context: ActionContext,
  target?: ActionTarget,
) {
  switch (actionType) {
    case 'add_to_cart':
      if (context.onAddToCart && context.variant) {
        context.onAddToCart({ variant: context.variant, quantity: context.quantity || 1 });
      }
      return;
    case 'buy_now':
      if (context.onBuyNow && context.variant) {
        context.onBuyNow({ variant: context.variant, quantity: context.quantity || 1 });
      }
      return;
    case 'select_variant':
      if (context.onSelectVariant && target?.variant_id) {
        context.onSelectVariant(target.variant_id);
      }
      return;
    case 'open_embed':
      if (context.onOpenEmbed && target) {
        context.onOpenEmbed(target);
      }
      return;
    default:
      return;
  }
}
