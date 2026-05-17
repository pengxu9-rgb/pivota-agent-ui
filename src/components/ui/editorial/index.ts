/**
 * Editorial-redesign primitives. Foundation for the Chat / Browse /
 * Brand / Cart / Orders rebuild (handoff in
 * `~/dev/design_handoff_editorial_redesign/README.md`). Pages compose
 * from these components rather than redefining type/colour/spacing
 * inline.
 */
export { Eyebrow, Mono, DisplayHeading, Headline, Title, Num } from './Type';
export { Chip, Pill } from './Chip';
export type { ChipProps, PillProps } from './Chip';
export { Button, IconButton } from './Button';
export type { ButtonProps, IconButtonProps } from './Button';
export { HairlineDivider } from './Divider';
export { InsightBlock } from './InsightBlock';
export { ProductCard } from './ProductCard';
export type {
  ProductCardProps,
  ProductSummaryBadge,
  ProductSummaryBadgeTone,
} from './ProductCard';
export { MerchantHeader } from './MerchantHeader';
export { TrackStepper, QtyStepper } from './Stepper';
