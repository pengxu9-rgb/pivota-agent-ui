export interface PDPPayload {
  schema_version: string;
  page_type: string;
  tracking: PageTracking;
  product: Product;
  product_group_id?: string;
  sellable_item_group_id?: string;
  product_line_id?: string;
  review_family_id?: string;
  identity_confidence?: number;
  match_basis?: string[];
  canonical_scope?: 'synthetic' | string;
  pdp_schema_profile?: 'beauty_formula' | 'beauty_tool' | 'generic_merch' | 'generic_product' | string;
  offers?: Offer[];
  offers_count?: number;
  default_offer_id?: string;
  best_price_offer_id?: string;
  x_offers_state?: 'loading' | 'ready' | 'error';
  x_reviews_state?: 'loading' | 'ready' | 'error';
  x_recommendations_state?: 'loading' | 'ready' | 'error';
  x_module_states?: Partial<Record<PdpModuleStateKey, PdpModuleState>>;
  x_source_locks?: Partial<Record<PdpSourceLockKey, boolean>>;
  x_height_spec?: Partial<Record<PdpModuleStateKey, number>>;
  modules: Module[];
  actions: GlobalAction[];
}

export type PdpModuleState = 'ABSENT' | 'LOADING' | 'READY' | 'EMPTY' | 'ERROR';
export type PdpModuleStateKey =
  | 'offers'
  | 'reviews_preview'
  | 'ugc_preview'
  | 'similar';
export type PdpSourceLockKey = 'reviews' | 'similar' | 'ugc';

export interface PageTracking {
  page_request_id: string;
  entry_point: string;
  experiment?: string;
}

export interface Product {
  product_id: string;
  title: string;
  pdp_schema_profile?: 'beauty_formula' | 'beauty_tool' | 'generic_merch' | 'generic_product' | string;
  subtitle?: string;
  brand?: { name: string };
  brand_story?: string;
  category_path?: string[];
  image_url?: string;
  tags?: string[];
  department?: string;
  beauty_meta?: {
    popular_looks?: string[];
    best_for?: string[];
    important_info?: string[];
  };
  recent_purchases?: Array<{
    user_label: string;
    variant_label?: string;
    time_label?: string;
    price_label?: string;
  }>;
  size_guide?: SizeGuide;
  default_variant_id: string;
  variants: Variant[];
  product_line_option_name?: string;
  product_line_options?: ProductLineOption[];
  price?: VariantPrice;
  availability?: { in_stock: boolean; available_quantity?: number };
  shipping?: { eta_days_range?: number[] };
  returns?: { return_window_days?: number; free_returns?: boolean };
  description?: string;
  merchant_id?: string;
  source?: string;
  commerce_mode?: string;
  checkout_handoff?: string;
  purchase_route?: string;
  external_redirect_url?: string;
  externalRedirectUrl?: string;
  affiliate_url?: string;
  external_url?: string;
  redirect_url?: string;
  url?: string;
  canonical_url?: string;
  destination_url?: string;
  source_url?: string;
  platform?: string;
}

export interface ProductLineOption {
  option_id?: string;
  label: string;
  value?: string;
  option_name?: string;
  axis?: string;
  merchant_id?: string;
  product_id?: string;
  title?: string;
  image_url?: string;
  label_image_url?: string;
  swatch_image_url?: string;
  swatch_color?: string;
  color_hex?: string;
  swatch?: { hex?: string; image_url?: string; imageUrl?: string; url?: string };
  selected?: boolean;
}

export interface SizeGuide {
  columns: string[];
  rows: Array<{
    label: string;
    values: string[];
  }>;
  note?: string;
  model_info?: string;
}

export interface VariantPrice {
  current: Price;
  compare_at?: Price;
}

export interface Variant {
  variant_id: string;
  sku_id?: string;
  title: string;
  options?: { name: string; value: string }[];
  swatch?: { hex?: string };
  beauty_meta?: {
    shade_hex?: string;
    finish?: string;
    coverage?: string;
    undertone?: string;
  };
  price?: VariantPrice;
  availability?: { in_stock: boolean; available_quantity?: number };
  image_url?: string;
  label_image_url?: string;
}

export interface Price {
  amount: number;
  currency: string;
}

export interface Offer {
  offer_id: string;
  product_group_id?: string;
  product_id?: string;
  merchant_id: string;
  merchant_name?: string;
  price: Price;
  variants?: Variant[];
  shipping?: {
    eta_days_range?: [number, number];
    cost?: Price;
    method_label?: string;
  };
  returns?: {
    return_window_days?: number;
    free_returns?: boolean;
  };
  inventory?: {
    in_stock?: boolean;
    available_quantity?: number;
  };
  fulfillment_type?: 'platform' | 'merchant' | '3pl' | string;
  tier?: string;
  commerce_mode?: string;
  checkout_handoff?: string;
  purchase_route?: string;
  seller_of_record?: string;
  merchant_checkout_url?: string;
  checkout_url?: string;
  purchase_url?: string;
  external_redirect_url?: string;
  externalRedirectUrl?: string;
  affiliate_url?: string;
  external_url?: string;
  redirect_url?: string;
  url?: string;
  product_url?: string;
  canonical_url?: string;
  destination_url?: string;
  source_url?: string;
  variant_id?: string;
  sku_id?: string;
  action?: {
    type?: string;
    url?: string;
    href?: string;
    redirect_url?: string;
    redirectUrl?: string;
  } | Record<string, unknown>;
}

export interface Module {
  module_id: string;
  type: ModuleType;
  priority: number;
  title?: string;
  tracking_context?: Record<string, unknown>;
  data: unknown;
}

export type ModuleType =
  | 'media_gallery'
  | 'price_promo'
  | 'product_intel'
  | 'trust_badges'
  | 'active_ingredients'
  | 'ingredients_inci'
  | 'how_to_use'
  | 'materials'
  | 'product_specs'
  | 'care_instructions'
  | 'size_fit'
  | 'usage_safety'
  | 'product_overview'
  | 'supplemental_details'
  | 'product_facts'
  | 'reviews_preview'
  | 'recommendations'
  | 'variant_selector';

export interface GlobalAction {
  action_type: ActionType;
  label: string;
  priority: number;
  target: ActionTarget;
}

export type ActionType = 'buy_now' | 'add_to_cart' | 'select_variant' | 'open_embed';

export interface ActionTarget {
  variant_id?: string;
  embed_intent_type?: string;
  resolve_params?: Record<string, string>;
}

export interface MediaGalleryData {
  items: MediaItem[];
  gallery_scope?: 'exact_item' | string;
  preview_scope?: 'product_line' | string;
  preview_items?: MediaItem[];
}

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  source?: string;
  source_scope?: string;
  source_tier?: string;
  source_kind?: string;
  alt_text?: string;
  thumbnail_url?: string;
  duration_ms?: number;
  merchant_id?: string;
  product_id?: string;
}

export interface PricePromoData {
  price: Price;
  compare_at?: Price;
  promotions?: { label: string; description?: string }[];
}

export interface ProductDetailsData {
  sections: DetailSection[];
}

export interface ProductIntelNarrative {
  headline?: string;
  body?: string;
}

export interface ProductIntelBestForItem {
  tag?: string;
  label: string;
  confidence?: string;
}

export interface ProductIntelHighlight {
  headline?: string;
  body?: string;
  evidence_strength?: string;
}

export interface ProductIntelRoutineFit {
  step?: string;
  am_pm?: string[];
  pairing_notes?: string[];
}

export interface ProductIntelWatchout {
  type?: string;
  label: string;
  severity?: string;
}

export interface ProductIntelCoreData {
  what_it_is?: ProductIntelNarrative;
  best_for?: ProductIntelBestForItem[];
  why_it_stands_out?: ProductIntelHighlight[];
  routine_fit?: ProductIntelRoutineFit;
  watchouts?: ProductIntelWatchout[];
  confidence?: {
    overall?: string;
    fields?: Record<string, string>;
  };
  freshness?: {
    generated_at?: string;
    source_version?: string;
    ttl_hours?: number;
  };
  quality_state?: string;
  evidence_profile?: string;
  source_coverage?: Record<string, boolean>;
}

export interface TextureFinishData {
  texture?: string;
  finish?: string;
  sensory_notes?: string[];
  layering_notes?: string[];
  confidence?: string;
  evidence_profile?: string;
}

export interface CommunitySignalsData {
  status?: 'available' | 'unavailable' | string;
  unavailable_reason?: string;
  top_loves?: string[];
  top_complaints?: string[];
  best_fit_users?: string[];
  mixed_feedback?: string[];
  source_counts?: Record<string, number>;
  source_mix?: string[];
  last_refreshed_at?: string;
  confidence?: string;
  evidence_profile?: string;
}

export interface ProductIntelData {
  contract_version?: string;
  display_name?: string;
  provenance?: {
    source?: string;
    generator?: string;
    selection_strategy?: string;
    reviewer_kind?: string;
    review_status?: string;
    review_decision?: string;
    field_sources?: Record<string, string>;
    gemini_quality_gate?: Record<string, unknown>;
    kb_key?: string;
    generated_at?: string;
  };
  canonical_product_ref?: {
    merchant_id?: string;
    product_id?: string;
  };
  product_group_id?: string | null;
  product_intel_core?: ProductIntelCoreData;
  texture_finish?: TextureFinishData | null;
  community_signals?: CommunitySignalsData | null;
  normalized_pdp?: {
    surface?: string;
    display_name?: string;
    insights_available?: boolean;
    self_canonical?: boolean;
    indexability?: string;
    structured_data_mode?: string;
    page_positioning?: string;
    quality_state?: string;
    evidence_profile?: string;
    truth_layers?: Record<string, string>;
  };
  confidence?: {
    overall?: string;
    fields?: Record<string, string>;
  };
  freshness?: {
    generated_at?: string;
    source_version?: string;
  };
  quality_state?: string;
  evidence_profile?: string;
  source_coverage?: Record<string, boolean>;
}

export interface ProductFactsData {
  sections: DetailSection[];
}

export interface StructuredTextItem {
  name?: string;
  title?: string;
  value?: string;
  description?: string;
  detail?: string;
  benefit?: string;
  concentration?: string;
  inci_name?: string;
}

export interface ActiveIngredientsData {
  title?: string;
  items?: Array<string | StructuredTextItem>;
  raw_text?: string;
  source_origin?: string;
  source_quality_status?: string;
}

export interface IngredientsInciData {
  title?: string;
  items?: Array<string | StructuredTextItem>;
  raw_text?: string;
  source_origin?: string;
  source_quality_status?: string;
}

export interface HowToUseData {
  title?: string;
  steps?: string[];
  raw_text?: string;
  source_origin?: string;
}

export interface DetailSection {
  heading: string;
  content_type: 'text';
  content: string;
  collapsed_by_default?: boolean;
}

export interface ReviewsPreviewData {
  scale: number;
  rating: number;
  review_count: number;
  aggregation_scope?: 'product_line' | 'exact_item' | string;
  exact_item_review_count?: number;
  product_line_review_count?: number;
  scope_label?: string;
  star_distribution?: Array<{
    stars: number;
    count?: number;
    percent?: number;
  }>;
  dimension_ratings?: Array<{
    label: string;
    score: number;
  }>;
  filter_chips?: Array<{
    label: string;
    count?: number;
  }>;
  questions?: Array<{
    question_id?: number;
    question: string;
    answer?: string;
    replies?: number;
    source?: 'merchant_faq' | 'review_derived' | 'community' | string;
    source_label?: string;
    support_count?: number;
  }>;
  brand_card?: {
    name: string;
    subtitle?: string;
  };
  preview_items?: Array<{
    review_id: string;
    rating: number;
    author_label?: string;
    title?: string;
    text_snippet: string;
    media?: MediaItem[];
  }>;
  filters?: Array<{
    id: string;
    label: string;
    count?: number;
  }>;
  tabs?: Array<{
    id: string;
    label: string;
    count?: number;
    default?: boolean;
  }>;
  scoped_summaries?: Record<
    string,
    {
      scale: number;
      rating: number;
      review_count: number;
      scope_label?: string;
      star_distribution?: Array<{
        stars: number;
        count?: number;
        percent?: number;
      }>;
      preview_items?: Array<{
        review_id: string;
        rating: number;
        author_label?: string;
        title?: string;
        text_snippet: string;
        media?: MediaItem[];
      }>;
    }
  >;
  entry_points?: {
    open_reviews?: { action_type: 'open_embed'; label: string; target: ActionTarget };
    write_review?: { action_type: 'open_embed'; label: string; target: ActionTarget };
  };
}

export interface RecommendationsData {
  strategy?: string;
  metadata?: {
    has_more?: boolean;
    similar_confidence?: 'high' | 'medium' | 'low' | string;
    low_confidence?: boolean;
    low_confidence_reason_codes?: string[];
    underfill?: number;
    retrieval_mix?: {
      internal?: number;
      external?: number;
    };
    selection_mix?: {
      same_brand_same_category?: number;
      same_brand_other_category?: number;
      other_brand_same_category?: number;
      other_brand_same_vertical?: number;
      semantic_peer?: number;
    };
    base_semantic?: {
      brand?: string | null;
      vertical?: string | null;
      inferred?: boolean;
      signal_strength?: number;
    };
  };
  items: Array<{
    product_id: string;
    title: string;
    description?: string;
    brand?: string;
    image_url?: string;
    price?: Price;
    rating?: number;
    review_count?: number;
    merchant_id?: string;
    merchant_name?: string;
    variant_count?: number;
    source?: string;
    reason?: string;
    product_type?: string;
    category?: string;
    department?: string;
    tags?: string[];
    card_title?: string;
    card_subtitle?: string;
    card_highlight?: string;
    card_badge?: string;
    search_card?: {
      title_candidate?: string;
      compact_candidate?: string;
      highlight_candidate?: string;
      proof_badge_candidate?: string;
    };
    shopping_card?: {
      highlight?: string;
    };
    market_signal_badges?: Array<{
      badge_type?: string;
      badge_label: string;
    }>;
    review_summary?: {
      rating?: number;
      average_rating?: number;
      avg_rating?: number;
      scale?: number;
      rating_scale?: number;
      review_count?: number;
      count?: number;
      total_reviews?: number;
    };
  }>;
}
