export type PdpTrackingEvent =
  | 'pdp_view'
  | 'pdp_core_ready'
  | 'pdp_module_impression'
  | 'pdp_module_ready'
  | 'pdp_fallback_used'
  | 'pdp_action_click'
  | 'pdp_gallery_open_viewer'
  | 'pdp_gallery_swipe'
  | 'pdp_gallery_close_viewer'
  | 'pdp_gallery_open_grid'
  | 'pdp_gallery_click_thumbnail'
  | 'pdp_candidates_resolved'
  | 'pdp_choose_seller_impression'
  | 'pdp_choose_seller_select'
  | 'pdp_recent_purchases_impression'
  | 'ugc_impression'
  | 'ugc_open_all'
  | 'ugc_click_item'
  | 'similar_impression'
  | 'similar_click'
  | 'reviews_shell_open'
  | 'reviews_shell_close';

export type PdpTrackingPayload = Record<string, unknown>;

class PdpTracking {
  private baseContext: PdpTrackingPayload = {};

  setBaseContext(context: PdpTrackingPayload) {
    this.baseContext = { ...context };
  }

  track(eventName: PdpTrackingEvent, payload: PdpTrackingPayload = {}) {
    const merged = {
      ...this.baseContext,
      ...payload,
      ts: new Date().toISOString(),
    };
    // Minimal viable tracking: structured console output.
    // If/when a real analytics SDK exists, swap this implementation.
    // eslint-disable-next-line no-console
    console.log('[TRACK]', eventName, merged);
  }
}

export const pdpTracking = new PdpTracking();
