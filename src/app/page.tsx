'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import { ImagePlus, Menu, ShoppingCart, Send, Package, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { ChatRecommendationCard, CARD_COLOR_VARIANTS } from '@/components/product/ChatRecommendationCard';
import { ChatWideProductCard } from '@/components/product/ChatWideProductCard';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { getAllowedParentOrigin, isAuroraEmbedMode, postRequestCloseToParent } from '@/lib/auroraEmbed';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import {
  sendMessage,
  getShoppingDiscoveryFeed,
  getBrowseHistory,
  type DiscoveryRecentView,
  type ProductResponse,
} from '@/lib/api';
import { mergeDiscoveryRecentViews, readLocalBrowseHistory } from '@/lib/browseHistoryStorage';
import { buildProductHref } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import {
  analyzeSkinPhotoFile,
  isShoppingSkinPhotoUploadBetaEnabled,
  resolvePhotoAnalysisLanguage,
  SKIN_PHOTO_ACCEPTED_TYPES,
} from '@/lib/photoAnalysis';
import { toast } from 'sonner';

const CHAT_RAIL_INITIAL_PAGE_SIZE = 12;
const CHAT_RAIL_PAGE_STEP = 12;
const NO_GROWTH_STOP_THRESHOLD = 2;

function buildProductKey(product: ProductResponse): string {
  return `${String(product?.merchant_id || '').trim()}::${String(product?.product_id || '').trim()}`;
}

function mergeUniqueProducts(current: ProductResponse[], incoming: ProductResponse[]) {
  const map = new Map<string, ProductResponse>();
  current.forEach((item) => map.set(buildProductKey(item), item));
  const before = map.size;
  incoming.forEach((item) => map.set(buildProductKey(item), item));
  return {
    merged: Array.from(map.values()),
    added: map.size - before,
  };
}

function buildStrictEmptyHint(metadata: Record<string, any>): string | null {
  const reason =
    String(
      metadata?.strict_empty_reason ||
        metadata?.route_health?.fallback_reason ||
        metadata?.proxy_search_fallback?.reason ||
        '',
    )
      .trim()
      .toLowerCase();
  if (!reason) return null;
  if (reason.includes('timeout')) return 'Search timed out; try a shorter query or add a brand keyword.';
  if (reason.includes('cache') || reason.includes('no_candidates')) {
    return 'No strong catalog match; add category + budget + brand for better recall.';
  }
  if (reason.includes('irrelevant')) return 'Results were filtered as off-topic; try a more specific shopping request.';
  return `No reliable matches (${reason}).`;
}

function AuroraEmbedCartHost() {
  const canPost = useMemo(() => Boolean(getAllowedParentOrigin()), []);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background px-6 text-center">
      <div className="text-sm font-semibold text-foreground">Cart</div>
      <div className="mt-2 max-w-sm text-xs text-muted-foreground">
        If the cart panel didn’t open automatically, please go back and retry from Aurora.
      </div>
      <button
        type="button"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl border border-border/60 bg-muted/30 px-4 text-sm font-semibold text-foreground/80"
        onClick={() => {
          const posted = postRequestCloseToParent({ reason: 'embed_host_close' });
          if (!posted) {
            // Fallback: closing will reveal the embed host, but users can still close the Aurora drawer.
            try {
              window.history.back();
            } catch {
              // ignore
            }
          }
        }}
        aria-label="Back to Aurora"
        title={canPost ? 'Back to Aurora' : 'Back'}
      >
        Back to Aurora
      </button>
      {!canPost ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Close this panel from Aurora.
        </div>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  const isEmbed = useMemo(() => isAuroraEmbedMode(), []);
  return isEmbed ? <AuroraEmbedCartHost /> : <HomePageApp />;
}

function HomePageApp() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile: closed by default, Desktop: always visible
  const [loading, setLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [hotDeals, setHotDeals] = useState<ProductResponse[]>([]);
  const [hotDealsStatus, setHotDealsStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [recentViews, setRecentViews] = useState<DiscoveryRecentView[]>([]);
  const [recentViewsReady, setRecentViewsReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  const { messages, addMessage, updateMessage, conversations, resetForGuest } = useChatStore();
  const { items, addItem, open } = useCartStore();
  const { user } = useAuthStore();
  const { ownerEmail, setOwnerEmail } = useChatStore();
  
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const hasUserMessages = messages.some(msg => msg.role === 'user');
  const photoUploadEnabled = isShoppingSkinPhotoUploadBetaEnabled();
  const composerBusy = loading || photoUploading;

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id || null;
    const localRecentViews = mergeDiscoveryRecentViews({
      localItems: readLocalBrowseHistory(50),
      limit: 50,
    }) as DiscoveryRecentView[];
    if (!userId) {
      setRecentViews(localRecentViews);
      setRecentViewsReady(true);
      return;
    }

    setRecentViewsReady(false);
    getBrowseHistory(50)
      .then((history) => {
        if (!cancelled) {
          setRecentViews(
            mergeDiscoveryRecentViews({
              accountItems: history.items || [],
              localItems: readLocalBrowseHistory(50),
              limit: 50,
            }) as DiscoveryRecentView[],
          );
        }
      })
      .catch((error) => {
        console.warn('Failed to load shopping behavior history:', error);
        if (!cancelled) setRecentViews(localRecentViews);
      })
      .finally(() => {
        if (!cancelled) setRecentViewsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // 加载Hot Deals商品
  useEffect(() => {
    if (!recentViewsReady) return;
    const loadHotDeals = async () => {
      setHotDealsStatus('loading');
      try {
        const result = await getShoppingDiscoveryFeed({
          surface: 'home_hot_deals',
          limit: 6,
          entry: 'plp',
          catalog: 'promo_pool',
          userId: user?.id || null,
          recentViews,
        });
        setHotDeals(result.products);
        setHotDealsStatus(result.products.length > 0 ? 'ready' : 'empty');
      } catch (error) {
        console.error('Failed to load hot deals:', error);
        setHotDeals([]);
        setHotDealsStatus('error');
      }
    };
    void loadHotDeals();
  }, [recentViews, recentViewsReady, user?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // For guests, do not show previous user's conversations
  useEffect(() => {
    const userEmail = user?.email || null;
    // If store belongs to a different user, reset
    if (ownerEmail && ownerEmail !== userEmail) {
      resetForGuest();
      setOwnerEmail(userEmail);
      return;
    }
    // If store has no owner yet, claim it with current user (can be null => guest)
    if (!ownerEmail) {
      setOwnerEmail(userEmail);
    }
    // If guest and no owner, do nothing (keeps fresh guest state)
  }, [user, ownerEmail, resetForGuest, setOwnerEmail, conversations.length]);

  const handleSend = async () => {
    if (!input.trim() || composerBusy) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input,
    };

    addMessage(userMessage);
    setInput('');
    setLoading(true);

    try {
      // Optional eval metadata for offline/AA-B testing runs (best-effort).
      let evalMetadata: Record<string, any> | undefined;
      try {
        const params = new URLSearchParams(window.location.search);
        const baseFromUrl = {
          run_id: (params.get('eval_run_id') || '').trim() || undefined,
          variant: (params.get('eval_variant') || '').trim() || undefined,
          suite_id: (params.get('eval_suite_id') || '').trim() || undefined,
          convo_id: (params.get('eval_convo_id') || '').trim() || undefined,
          turn_id: (() => {
            const raw = (params.get('eval_turn_id') || '').trim();
            return raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
          })(),
        };

        const hasEvalParams = Object.values(baseFromUrl).some((v) => v != null && v !== '');
        if (hasEvalParams) {
          window.sessionStorage.setItem('pivota_eval_meta_v1', JSON.stringify(baseFromUrl));
        }

        const raw = window.sessionStorage.getItem('pivota_eval_meta_v1');
        const base = raw ? JSON.parse(raw) : null;
        if (base && typeof base === 'object') {
          const state = useChatStore.getState();
          const convoId = state.currentConversationId || undefined;
          const userTurns = Array.isArray(state.messages)
            ? state.messages.filter((m) => m?.role === 'user').length
            : undefined;
          evalMetadata = {
            eval: {
              ...(base as any),
              ...(convoId ? { convo_id: (base as any).convo_id || convoId } : {}),
              ...(typeof userTurns === 'number' && (base as any).turn_id == null
                ? { turn_id: userTurns }
                : {}),
            },
          };
        }
      } catch {
        // ignore
      }

      const userQuery = input.trim();
      const searchResult = await sendMessage(
        input,
        undefined,
        {
          ...(evalMetadata ? { metadata: evalMetadata } : {}),
          pagination: { page: 1, limit: CHAT_RAIL_INITIAL_PAGE_SIZE },
          userId: user?.id || null,
        },
      );
      const products = Array.isArray(searchResult?.products) ? searchResult.products : [];
      const fallbackReply = searchResult?.reply;
      const metadata =
        searchResult?.metadata && typeof searchResult.metadata === 'object'
          ? (searchResult.metadata as Record<string, any>)
          : {};
      const strictEmptyHint = searchResult?.strict_empty ? buildStrictEmptyHint(metadata) : null;
      
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: products.length > 0 
          ? `I found ${products.length} product(s) for you!`
          : [fallbackReply || "I couldn't find any products matching your search.", strictEmptyHint]
              .filter(Boolean)
              .join('\n'),
        products,
        recommendation_paging: products.length > 0
          ? {
              query: userQuery,
              page: searchResult.page_info?.page || 1,
              limit: CHAT_RAIL_INITIAL_PAGE_SIZE,
              hasMore: Boolean(searchResult.page_info?.has_more),
              isLoadingMore: false,
              noGrowthCount: 0,
            }
          : undefined,
      };

      addMessage(assistantMessage);
    } catch (error) {
      console.error('Search error:', error);
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error searching for products. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSkinPhotoUploadClick = () => {
    if (!photoUploadEnabled || composerBusy) return;
    const latestUserText =
      input ||
      [...messages].reverse().find((message) => message.role === 'user')?.content ||
      '';
    const language = resolvePhotoAnalysisLanguage(latestUserText);
    const confirmed = window.confirm(
      language === 'CN'
        ? '照片上传 Beta 目前只用于面部/皮肤照片分析，不支持商品瓶身或 PDP 截图识别。继续上传吗？'
        : 'Photo upload beta is for face/skin analysis only. Product bottles or PDP screenshots are not supported. Continue?',
    );
    if (!confirmed) return;
    photoInputRef.current?.click();
  };

  const handleSkinPhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file || composerBusy) return;

    const languageHint =
      input ||
      [...messages].reverse().find((message) => message.role === 'user')?.content ||
      '';
    const language = resolvePhotoAnalysisLanguage(languageHint);

    const userMessage = {
      id: `photo-u-${Date.now()}`,
      role: 'user' as const,
      content:
        language === 'CN'
          ? `已上传皮肤照片：${file.name}`
          : `Uploaded skin photo: ${file.name}`,
    };
    addMessage(userMessage);
    setPhotoUploading(true);

    try {
      const result = await analyzeSkinPhotoFile(file, {
        languageHint,
        userId: user?.id || null,
        sourceAgent: 'shopping_agent',
      });
      addMessage({
        id: `photo-a-${Date.now()}`,
        role: 'assistant',
        content: result.assistantText,
      });
      if (result.status !== 'success') {
        toast.message(language === 'CN' ? '照片分析未完成，请重试或改用文字描述。' : 'Photo analysis did not complete. Try again or describe your skin in text.');
      }
    } catch (error) {
      console.error('Skin photo analysis error:', error);
      addMessage({
        id: `photo-a-error-${Date.now()}`,
        role: 'assistant',
        content:
          language === 'CN'
            ? '照片分析暂时不可用。请稍后重试，或直接用文字描述肤况。'
            : 'Photo analysis is temporarily unavailable. Try again later or describe your skin in text.',
      });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleLoadMoreMessageProducts = useCallback(
    async (messageId: string) => {
      const target = messages.find((message) => message.id === messageId && message.role === 'assistant');
      if (!target) return;
      const paging = target.recommendation_paging;
      if (!paging || paging.isLoadingMore || !paging.hasMore || !paging.query) return;

      updateMessage(messageId, {
        recommendation_paging: {
          ...paging,
          isLoadingMore: true,
        },
      });

      try {
        const nextPage = paging.page + 1;
        const result = await sendMessage(paging.query, undefined, {
          pagination: {
            page: nextPage,
            limit: Math.max(CHAT_RAIL_PAGE_STEP, Number(paging.limit || CHAT_RAIL_INITIAL_PAGE_SIZE)),
          },
          userId: user?.id || null,
        });

        const incoming = Array.isArray(result?.products) ? result.products : [];
        const currentProducts = Array.isArray(target.products) ? target.products : [];
        const { merged, added } = mergeUniqueProducts(currentProducts, incoming);
        const noGrowthCount = added === 0 ? Number(paging.noGrowthCount || 0) + 1 : 0;
        const hasMore = Boolean(result?.page_info?.has_more) && noGrowthCount < NO_GROWTH_STOP_THRESHOLD;

        updateMessage(messageId, {
          products: merged,
          recommendation_paging: {
            ...paging,
            page: nextPage,
            hasMore,
            isLoadingMore: false,
            noGrowthCount,
          },
        });
      } catch (error) {
        console.error('Load more recommendations error:', error);
        toast.error('Failed to load more recommendations');
        updateMessage(messageId, {
          recommendation_paging: {
            ...paging,
            isLoadingMore: false,
          },
        });
      }
    },
    [messages, updateMessage, user?.id],
  );

  const handleAddToCart = (product: any) => {
    const defaultVariant =
      Array.isArray(product?.variants) && product.variants.length > 0
        ? product.variants[0]
        : null;
    const variantId =
      String(
        product?.variant_id ||
          defaultVariant?.variant_id ||
          defaultVariant?.id ||
          product?.product_ref?.variant_id ||
          product?.product_ref?.sku_id ||
          product?.sku_id ||
          '',
      ).trim() || String(product.product_id);
    const sku =
      String(defaultVariant?.sku || defaultVariant?.sku_id || product?.sku || product?.sku_id || '').trim() ||
      undefined;
    const cartItemId = product?.merchant_id
      ? `${product.merchant_id}:${variantId}`
      : variantId;
    addItem({
      id: cartItemId,
      product_id: product.product_id,
      variant_id: variantId,
      sku,
      title: product.title,
      price: product.price,
      currency: product.currency,
      imageUrl: normalizeDisplayImageUrl(product.image_url, '/placeholder.svg'),
      merchant_id: product.merchant_id,
      quantity: 1,
    });
    toast.success(`✓ Added to cart! ${product.title}`);
  };

  return (
    <div className="flex h-screen w-full bg-gradient-mesh overflow-x-hidden relative">
      {/* Animated background gradients */}
      <div className="absolute inset-0 -z-10 opacity-40" />
      <div className="absolute top-1/4 left-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-cyan-400/20 blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-gradient-to-l from-cyan-400/20 via-purple-500/30 to-indigo-500/30 blur-3xl -z-10 animate-pulse" />

      {/* Sidebar */}
      <ChatSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 px-4 flex items-center justify-between border-b border-border bg-card/70 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-secondary transition-colors lg:hidden"
            >
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/account"
                  className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 hover:bg-card/80 transition-colors"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground truncate max-w-[160px]">
                    {user.email || user.id}
                  </span>
                </Link>
                <Link href="/account" className="sm:hidden">
                  <Button variant="ghost" size="icon" aria-label="Account">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="hidden sm:block">
                  <Button variant="outline" size="sm">
                    Login
                  </Button>
                </Link>
              </>
            )}
            <Link href="/products">
              <Button variant="ghost" size="icon">
                <Package className="h-5 w-5 text-muted-foreground" />
              </Button>
            </Link>
            <button
              onClick={open}
              className="relative h-10 w-10 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 transition-colors"
            >
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              {itemCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                  style={{ backgroundColor: '#D85A30' }}
                >
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
          <AnimatePresence>
            {messages.map((message, idx) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${
                  message.role === 'user'
                    ? 'justify-end'
                    : idx === 0
                    ? 'justify-center items-center flex-1'
                    : 'justify-start'
                }`}
              >
                {idx === 0 && message.role === 'assistant' ? (
                  <div className="text-center max-w-md space-y-3">
                    <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                      <span className="gradient-text">Shop Anything</span>
                      <br />
                      <span className="text-foreground">Through Conversation</span>
                    </h1>
                  </div>
                ) : (
                  <div
                    className={`space-y-2 ${
                      message.role === 'assistant' && Array.isArray(message.products) && message.products.length > 0
                        ? 'max-w-[99%] md:max-w-[97%]'
                        : 'max-w-[80%]'
                    }`}
                  >
                    <div
                      className={
                        message.role === 'user'
                          ? 'bg-secondary border border-border rounded-3xl rounded-br-sm px-4 py-3 text-sm'
                          : 'bg-primary text-primary-foreground rounded-3xl rounded-bl-sm px-4 py-3 text-sm shadow-lg'
                      }
                    >
                      {message.content}
                    </div>

                    {message.products && message.products.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground px-0.5">
                          Recommended for you:
                        </p>
                        {/* 2-col grid for first 2 products */}
                        <div className="grid grid-cols-2 gap-2">
                          {message.products.slice(0, 2).map((product, i) => (
                            <ChatRecommendationCard
                              key={buildProductKey(product)}
                              product={product}
                              onAddToCart={handleAddToCart}
                              colorVariant={CARD_COLOR_VARIANTS[i % CARD_COLOR_VARIANTS.length]}
                            />
                          ))}
                        </div>
                        {/* Wide horizontal cards for 3rd+ */}
                        {message.products.slice(2).map((product, i) => (
                          <ChatWideProductCard
                            key={buildProductKey(product)}
                            product={product}
                            onAddToCart={handleAddToCart}
                            colorVariant={CARD_COLOR_VARIANTS[(i + 2) % CARD_COLOR_VARIANTS.length]}
                          />
                        ))}
                        {message.recommendation_paging?.hasMore ? (
                          <button
                            type="button"
                            className="w-full rounded-xl border py-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                            style={{ borderColor: 'rgba(44,44,42,0.08)', borderWidth: '0.5px' }}
                            disabled={Boolean(message.recommendation_paging?.isLoadingMore)}
                            onClick={() => handleLoadMoreMessageProducts(message.id)}
                          >
                            {message.recommendation_paging?.isLoadingMore
                              ? 'Loading...'
                              : 'Load more recommendations'}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {composerBusy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="max-w-[80%] bg-primary text-primary-foreground rounded-3xl rounded-bl-sm px-4 py-3 text-sm shadow-lg">
                <div className="flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border space-y-3 bg-card/70 backdrop-blur-xl">
          {/* Hot Deals - Trending Products */}
          {!hasUserMessages && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <h3 className="text-sm font-semibold text-foreground/80 px-2">Hot Deals</h3>
              <div className="overflow-x-auto pb-2 -mx-2 px-2">
                <div className="flex gap-3 min-w-max">
                  {hotDeals.length > 0 ? (
                    hotDeals.map((product) => {
                      const isExternal = Boolean(product.external_redirect_url);
                      const cardHref = buildProductHref(product.product_id, product.merchant_id);
                      return (
                      <Link
                        key={product.product_id}
                        href={cardHref}
                        prefetch={false}
                        className="flex-shrink-0 w-24 group"
                        onClick={(event) => {
                          if (event.defaultPrevented) return;
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                          event.preventDefault();
                          router.push(appendCurrentPathAsReturn(cardHref));
                        }}
                      >
                        <div className="relative aspect-square rounded-2xl overflow-hidden mb-2 ring-1 ring-border group-hover:ring-primary transition-all">
                          <Image
                            src={normalizeDisplayImageUrl(product.image_url, '/placeholder.svg')}
                            alt={product.title}
                            fill
                            className="object-cover group-hover:scale-110 transition-transform duration-300"
                            unoptimized
                          />
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 group-hover:text-foreground transition-colors">
                          {product.title}
                        </p>
                        <p className="text-xs font-semibold">${typeof product.price === 'number' ? product.price.toFixed(2) : product.price}</p>
                      </Link>
                      );
                    })
                  ) : hotDealsStatus === 'loading' ? (
                    <p className="text-xs text-muted-foreground">Loading products...</p>
                  ) : hotDealsStatus === 'error' ? (
                    <p className="text-xs text-muted-foreground">Unable to load hot deals right now.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No hot deals available right now.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Quick Suggestions */}
          {!hasUserMessages && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex gap-2 flex-wrap"
            >
              {['Water bottle', 'Hoodies', 'Electronics'].map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80 transition-colors"
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                </Badge>
              ))}
            </motion.div>
          )}

          <div className="flex items-center gap-2 bg-secondary border border-border rounded-2xl px-3 py-2">
            {photoUploadEnabled ? (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept={SKIN_PHOTO_ACCEPTED_TYPES.join(',')}
                  className="hidden"
                  onChange={handleSkinPhotoSelected}
                />
                <button
                  type="button"
                  onClick={handleSkinPhotoUploadClick}
                  disabled={composerBusy}
                  className="h-8 w-8 rounded-lg flex flex-shrink-0 items-center justify-center border border-border/70 bg-background/70 text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Upload skin photo"
                  title="Upload skin photo"
                >
                  <ImagePlus className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask me anything..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              disabled={composerBusy}
            />
            <button
              onClick={handleSend}
              disabled={composerBusy || !input.trim()}
              className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-r from-indigo-500 to-purple-500 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
