'use client';

import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import {
  Camera,
  Heart,
  Menu,
  Send,
  ShoppingBag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { ProductCard } from '@/components/ui/editorial';
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
import {
  buildProductHrefForProduct,
  isExternalAliasOnlyProduct,
} from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import {
  analyzeSkinPhotoFile,
  isShoppingSkinPhotoUploadBetaEnabled,
  resolvePhotoAnalysisLanguage,
  SKIN_PHOTO_ACCEPTED_TYPES,
} from '@/lib/photoAnalysis';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DecisionComparison } from '@/components/chat/DecisionComparison';
import { deriveBrief, queryForBrief, contextualSuggestions, productKey, type ShoppingBrief } from '@/features/shopping/model';
import { runShoppingTurn } from '@/features/shopping/runShoppingTurn';
import { buildDecisionReport } from '@/features/shopping/decision';

const CHAT_RAIL_INITIAL_PAGE_SIZE = 12;
const CHAT_RAIL_PAGE_STEP = 12;
const NO_GROWTH_STOP_THRESHOLD = 2;
const DAILY_PICKS_REQUEST_LIMIT = 10;
const DAILY_PICKS_DISPLAY_LIMIT = 5;

function buildProductKey(product: ProductResponse): string {
  return productKey(product);
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

function friendlyName(user: { email?: string | null; name?: string | null } | null | undefined): string {
  if (!user) return '';
  const name = String(user.name || '').trim();
  if (name) return name.split(/\s+/)[0];
  const email = String(user.email || '').trim();
  if (!email) return '';
  const local = email.split('@')[0] || '';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function formatDayStamp(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  return `${day} ${month}`.toLowerCase();
}

function formatMessageTime(timestamp: Date | string): string {
  const parsed = new Date(timestamp);
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
}

function formatPriceLabel(price: unknown, currency?: string): string {
  const amount = typeof price === 'number' ? price : Number(price);
  // A zero here means the search response did not provide a usable sell price,
  // not that the product is free. Do not advertise it as "$0" in chat.
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const symbol = currency && currency.toUpperCase() !== 'USD' ? currency.toUpperCase() + ' ' : '$';
  return `${symbol}${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/** Brand v2 "Today's picks" thumbnail — 96px wide, 4/5 image. */
const TodaysEditCard = memo(function TodaysEditCard({ product }: { product: ProductResponse }) {
  const router = useRouter();
  const cardHref = buildProductHrefForProduct(product);
  return (
    <Link
      href={cardHref}
      prefetch={false}
      className="group flex w-24 flex-shrink-0 flex-col gap-1.5"
      onClick={(event) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        router.push(appendCurrentPathAsReturn(cardHref));
      }}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-[#F4F4F2]">
        <Image
          src={normalizeDisplayImageUrl(product.image_url, '/placeholder.svg')}
          alt={product.title}
          fill
          className="object-cover transition-transform duration-300 lg:group-hover:scale-[1.04]"
          sizes="96px"
          unoptimized
        />
      </div>
      <p className="text-[12px] font-normal leading-[1.3] text-foreground line-clamp-2">
        {product.title}
      </p>
      <span className="text-[13px] font-semibold tabular-nums text-foreground">
        {formatPriceLabel(product.price, product.currency)}
      </span>
    </Link>
  );
});

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
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile: closed by default
  const [hotDeals, setHotDeals] = useState<ProductResponse[]>([]);
  const [hotDealsStatus, setHotDealsStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [recentViews, setRecentViews] = useState<DiscoveryRecentView[]>([]);
  const [recentViewsReady, setRecentViewsReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { messages, conversations, resetForGuest, tasks, draftTask, currentConversationId, beginRequest, completeRequest, updateTask, updateMessageForConversation, toggleSaved } = useChatStore();
  const task = (currentConversationId && tasks[currentConversationId]) || draftTask;
  const input = task.draft;
  const setInput = (draft: string) => updateTask({ draft });
  const { items, open } = useCartStore();
  const { user } = useAuthStore();
  const { ownerEmail, setOwnerEmail } = useChatStore();

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const hasUserMessages = messages.some((msg) => msg.role === 'user');
  const photoUploadEnabled = isShoppingSkinPhotoUploadBetaEnabled();
  const composerBusy = task.request?.status === 'pending';
  const suggestions = contextualSuggestions(task.brief, task.displayedProducts.length > 0);
  const queryChips = [
    ...(task.brief.category ? [{ key: 'category', label: task.brief.category }] : []),
    ...(task.brief.fragranceFree ? [{ key: 'fragranceFree', label: 'Fragrance-free required' }] : []),
    ...(task.brief.budget ? [{ key: 'budget', label: `${task.brief.budget.exclusive ? 'Under' : 'Up to'} ${task.brief.budget.currency} ${task.brief.budget.amount}` }] : []),
    ...(task.brief.requestedCount ? [{ key: 'requestedCount', label: `${task.brief.requestedCount} options` }] : []),
  ];
  const greetingName = friendlyName(user);
  const todayStamp = useMemo(() => formatDayStamp(new Date()), []);

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

  // Load "Today's edit" picks — previously labeled Hot Deals.
  useEffect(() => {
    if (!recentViewsReady) return;
    const loadHotDeals = async () => {
      setHotDealsStatus('loading');
      try {
        const result = await getShoppingDiscoveryFeed({
          surface: 'home_hot_deals',
          limit: DAILY_PICKS_REQUEST_LIMIT,
          entry: 'plp',
          catalog: 'promo_pool',
          userId: user?.id || null,
          recentViews,
        });
        const linkablePicks = result.products
          .filter((product) => !isExternalAliasOnlyProduct(product))
          .slice(0, DAILY_PICKS_DISPLAY_LIMIT);
        setHotDeals(linkablePicks);
        setHotDealsStatus(linkablePicks.length > 0 ? 'ready' : 'empty');
      } catch (error) {
        console.error("Failed to load today's edit:", error);
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
    if (ownerEmail && ownerEmail !== userEmail) {
      resetForGuest();
      setOwnerEmail(userEmail);
      return;
    }
    if (!ownerEmail) {
      setOwnerEmail(userEmail);
    }
  }, [user, ownerEmail, resetForGuest, setOwnerEmail, conversations.length]);

  const handleSend = async (override?: string, editedBrief?: ShoppingBrief) => {
    const query = (override ?? input).trim();
    const current = useChatStore.getState();
    if (!query || composerBusy || (current.currentConversationId && current.tasks[current.currentConversationId]?.request?.status === 'pending')) return;
    const brief = editedBrief || deriveBrief(query, task.brief);
    const taskSnapshot = task;
    const identity = beginRequest(query, brief);
    updateTask({ draft: '' }, identity.conversationId);
    const conversationState = useChatStore.getState();
    const requestMessages = conversationState.conversations.find((c) => c.id === identity.conversationId)?.messages || [];
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

      const response = await runShoppingTurn(query, taskSnapshot, brief, {
        ...(evalMetadata ? { metadata: evalMetadata } : {}),
        userId: user?.id || null,
        conversationId: identity.conversationId,
        conversationMessages: requestMessages,
      });
      completeRequest(identity, response.message, response.taskPatch);
    } catch (error) {
      console.error('Search error:', error);
      completeRequest(identity, {
        id: `error-${identity.requestId}`,
        role: 'assistant', kind: 'error',
        content: 'There was an error reaching the catalog. Your brief and earlier products are saved. Try again.',
      });
    }
  };

  const removeConstraint = (key: string) => {
    if (composerBusy) return;
    const brief = { ...task.brief, [key]: undefined };
    if (key === 'category') brief.intent = '';
    updateTask({ brief });
    // The next request is regenerated from the edited brief, so a removed
    // requirement is absent from both the visible chips and the actual query.
    const removed = key === 'fragranceFree' ? 'fragrance-free requirement' : key === 'budget' ? 'budget' : key === 'requestedCount' ? 'number of options limit' : 'category requirement';
    void handleSend(`Remove the ${removed}. ${queryForBrief(brief)}`, brief);
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
        ? '照片上传 Beta 目前只用于面部/皮肤照片分析,不支持商品瓶身或 PDP 截图识别。继续上传吗?'
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
        language === 'CN' ? `已上传皮肤照片:${file.name}` : `Uploaded skin photo: ${file.name}`,
    };
    const identity = beginRequest(userMessage.content, task.brief);

    try {
      const result = await analyzeSkinPhotoFile(file, {
        languageHint,
        userId: user?.id || null,
        sourceAgent: 'shopping_agent',
      });
      completeRequest(identity, {
        id: `photo-a-${Date.now()}`,
        role: 'assistant',
        content: result.assistantText,
      });
      if (result.status !== 'success') {
        toast.message(
          language === 'CN'
            ? '照片分析未完成,请重试或改用文字描述。'
            : 'Photo analysis did not complete. Try again or describe your skin in text.',
        );
      }
    } catch (error) {
      console.error('Skin photo analysis error:', error);
      completeRequest(identity, {
        id: `photo-a-error-${Date.now()}`,
        kind: 'error',
        role: 'assistant',
        content:
          language === 'CN'
            ? '照片分析暂时不可用。请稍后重试,或直接用文字描述肤况。'
            : 'Photo analysis is temporarily unavailable. Try again later or describe your skin in text.',
      });
    }
  };

  const handleLoadMoreMessageProducts = useCallback(
    async (messageId: string) => {
      const target = messages.find(
        (message) => message.id === messageId && message.role === 'assistant',
      );
      if (!target) return;
      const paging = target.recommendation_paging;
      if (!paging || paging.isLoadingMore || !paging.hasMore || !paging.query) return;

      const origin = useChatStore.getState();
      const conversationId = origin.currentConversationId;
      const ownerEpoch = origin.ownerEpoch;
      const originatingRequestId = conversationId ? origin.tasks[conversationId]?.request?.id : undefined;
      if (!conversationId) return;
      const patchMessage = (patch: Parameters<typeof updateMessageForConversation>[2]) => {
        if (useChatStore.getState().ownerEpoch === ownerEpoch && useChatStore.getState().tasks[conversationId]?.request?.id === originatingRequestId) updateMessageForConversation(conversationId, messageId, patch);
      };
      patchMessage({
        recommendation_paging: { ...paging, isLoadingMore: true },
      });

      try {
        const nextPage = paging.page + 1;
        const result = await sendMessage(paging.query, undefined, {
          pagination: {
            page: nextPage,
            limit: Math.max(CHAT_RAIL_PAGE_STEP, Number(paging.limit || CHAT_RAIL_INITIAL_PAGE_SIZE)),
          },
          userId: user?.id || null,
          conversationId,
          conversationMessages: origin.messages,
        });

        const incoming = Array.isArray(result?.products) ? result.products : [];
        const currentProducts = Array.isArray(target.products) ? target.products : [];
        const { merged, added } = mergeUniqueProducts(currentProducts, incoming);
        const noGrowthCount = added === 0 ? Number(paging.noGrowthCount || 0) + 1 : 0;
        const hasMore =
          Boolean(result?.page_info?.has_more) && noGrowthCount < NO_GROWTH_STOP_THRESHOLD;

        const decision = await buildDecisionReport(merged, origin.tasks[conversationId]?.brief || { intent: '' }, false);
        const eligible = decision.items.filter((item) => item.eligibility !== 'rejected');
        patchMessage({
          decision: { ...decision, items: eligible },
          products: eligible.map((item) => item.product),
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
        patchMessage({
          content: `${target.content}\nMore results could not be loaded. You can retry below.`,
          recommendation_paging: { ...paging, isLoadingMore: false },
        });
      } finally {
        const latest = useChatStore.getState();
        if (latest.ownerEpoch === ownerEpoch && latest.tasks[conversationId]?.request?.id !== originatingRequestId) {
          updateMessageForConversation(conversationId, messageId, { recommendation_paging: { ...paging, isLoadingMore: false } });
        }
      }
    },
    [messages, updateMessageForConversation, user?.id],
  );

  const handleSave = useCallback((product: ProductResponse) => {
    toggleSaved(product);
  }, [toggleSaved]);

  return (
    <div className="flex h-screen w-full bg-white text-foreground overflow-x-hidden">
      {/* Mobile drawer (existing ChatSidebar) — also fills the desktop
          left rail for now; an editorial sidebar restyle is a follow-up. */}
      <ChatSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex flex-1 min-w-0 flex-col">
        {/* Brand header — 54px */}
        <header className="relative flex h-[54px] flex-shrink-0 items-center justify-between border-b border-border bg-white px-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-opacity active:opacity-60"
            >
              <Menu size={20} strokeWidth={1.6} />
            </button>
          </div>
          {/* Wordmark — centered, visible on all breakpoints */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2 flex items-center" aria-label="Pivota home">
            <span className="pv-wordmark pv-wordmark--sm">Pivota</span>
          </Link>
          <div className="flex items-center gap-1">
            {!user ? (
              <Link href="/login" className="hidden sm:block px-3 py-1.5 text-[13px] font-medium text-[#534AB7]">
                Sign in
              </Link>
            ) : null}
            <button
              type="button"
              aria-label="Open bag"
              onClick={open}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-opacity active:opacity-60"
            >
              <ShoppingBag size={18} strokeWidth={1.5} />
              {itemCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D85A30] px-1 text-[9px] font-bold text-white"
                >
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        {/* Query chips — derived from the latest user input */}
        {queryChips.length > 0 ? (
          <div className="flex-shrink-0 border-b border-border bg-white">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-3 py-2">
              {queryChips.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => removeConstraint(key)}
                  disabled={composerBusy}
                  aria-label={`Remove ${label} and search again`}
                  className="flex-shrink-0 rounded-full border border-[#534AB7]/20 bg-[#EEEDFE] px-3 py-1 text-[11px] font-medium text-[#534AB7] transition-opacity active:opacity-70"
                >
                  {label} ×
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {task.savedProducts.length ? <div className="border-b border-border px-4 py-2 text-xs"><details><summary className="cursor-pointer font-medium">Saved in this task ({task.savedProducts.length})</summary><ul className="mt-2 space-y-2">{task.savedProducts.map((product) => <li key={productKey(product)}><Link href={buildProductHrefForProduct(product)} className="text-[#534AB7] underline">{product.title}</Link><button type="button" onClick={() => toggleSaved(product)} className="ml-3" aria-label={`Remove ${product.title} from saved`}>Remove</button></li>)}</ul></details></div> : null}
        {task.request && ['error', 'interrupted'].includes(task.request.status) ? <div className="px-4 py-2"><button type="button" onClick={() => void handleSend(task.request?.query)} className="text-sm text-[#534AB7] underline">Retry last request</button></div> : null}

        {/* Scrollable body — greeting + today's edit on empty state,
            conversation thread once the user has spoken. */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-4 py-6 lg:px-8 lg:py-10">
            {!hasUserMessages ? (
              <EditorialGreeting
                greetingName={greetingName}
                todayStamp={todayStamp}
                hotDeals={hotDeals}
                hotDealsStatus={hotDealsStatus}
              />
            ) : (
              <ConversationThread
                messages={messages}
                onSave={handleSave}
                savedProducts={task.savedProducts}
                suggestions={suggestions}
                onLoadMore={handleLoadMoreMessageProducts}
                onFollowUp={(prompt) => setInput(prompt)}
                composerBusy={composerBusy}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-border bg-white">
          <div className="mx-auto w-full max-w-[720px] px-4 pb-4 pt-2 lg:px-8">
            {/* Chip rail above composer */}
            <div className="-mx-2 mb-2 flex gap-1.5 overflow-x-auto px-2 pb-1">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  disabled={composerBusy}
                  className="flex-shrink-0 rounded-full border border-[#534AB7]/20 bg-[#EEEDFE] px-3 py-1.5 text-[11px] font-medium text-[#534AB7] transition-opacity active:opacity-70 disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-full border border-border bg-[#F4F4F2] px-3 py-1.5 transition-colors focus-within:border-[#534AB7]/40">
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
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    aria-label="Upload photo"
                  >
                    <Camera size={16} strokeWidth={1.6} />
                  </button>
                </>
              ) : null}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                aria-label="Shopping request"
                placeholder="Tell Pivota what you're looking for…"
                className="flex-1 bg-transparent py-1.5 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                disabled={composerBusy}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={composerBusy || !input.trim()}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%)' }}
                aria-label="Send"
              >
                <Send size={14} strokeWidth={1.6} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Empty-state greeting ─────────────────────────────────────────── */

function EditorialGreeting({
  greetingName,
  todayStamp,
  hotDeals,
  hotDealsStatus,
}: {
  greetingName: string;
  todayStamp: string;
  hotDeals: ProductResponse[];
  hotDealsStatus: 'loading' | 'ready' | 'empty' | 'error';
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="flex flex-col gap-8"
    >
      <div>
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ background: 'linear-gradient(135deg, #534AB7, #1D9E75)' }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#534AB7]">
            Pivota · Personal shopper
          </span>
        </div>
        <h2 className="mt-3 text-balance text-[26px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
          {greetingName ? `Welcome back, ${greetingName}.` : 'Welcome back.'}{' '}
          <span className="font-normal text-muted-foreground">
            What are we shopping today?
          </span>
        </h2>
        <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-muted-foreground">
          I keep track of what you&apos;ve been browsing and what&apos;s new in the houses you
          follow. Ask anything — I&apos;ll find it for you.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ background: 'linear-gradient(135deg, #534AB7, #1D9E75)' }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#534AB7]">
              Today&apos;s picks
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">{todayStamp}</span>
        </div>
        <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <div className="flex min-w-max gap-3">
            {hotDeals.length > 0 ? (
              hotDeals
                .slice(0, DAILY_PICKS_DISPLAY_LIMIT)
                .map((product) => <TodaysEditCard key={buildProductKey(product)} product={product} />)
            ) : (
              <p className="text-[14px] text-muted-foreground">
                {hotDealsStatus === 'loading'
                  ? 'Pulling fresh picks…'
                  : hotDealsStatus === 'error'
                    ? "Couldn't reach the edit right now."
                    : 'No picks yet — ask me anything to get started.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/* ── Conversation thread ──────────────────────────────────────────── */

function ConversationThread({
  messages,
  onSave,
  savedProducts,
  suggestions,
  onLoadMore,
  onFollowUp,
  composerBusy,
}: {
  messages: ReturnType<typeof useChatStore.getState>['messages'];
  onSave: (product: ProductResponse) => void;
  savedProducts: ProductResponse[];
  suggestions: string[];
  onLoadMore: (messageId: string) => void;
  onFollowUp: (prompt: string) => void;
  composerBusy: boolean;
}) {
  return (
    <section className="flex flex-col gap-7">
      <AnimatePresence initial={false}>
        {messages.map((message) =>
          message.role === 'user' ? (
            <UserMessageRow key={message.id} content={message.content || ''} />
          ) : (
            <AssistantMessageRow
              key={message.id}
              message={message}
              onSave={onSave}
              savedProducts={savedProducts}
              suggestions={suggestions}
              onLoadMore={onLoadMore}
              onFollowUp={onFollowUp}
            />
          ),
        )}
      </AnimatePresence>
      {composerBusy ? <TypingIndicator /> : null}
    </section>
  );
}

function UserMessageRow({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex justify-end"
    >
      <div
        className="max-w-[80%] rounded-[18px] px-4 py-2.5"
        style={{ background: 'linear-gradient(135deg, #534AB7 0%, #7B6FD4 100%)' }}
      >
        <p className="text-[14px] leading-relaxed text-white">{content}</p>
      </div>
    </motion.div>
  );
}

function AssistantMessageRow({
  message,
  onSave,
  savedProducts,
  suggestions,
  onLoadMore,
  onFollowUp,
}: {
  message: ReturnType<typeof useChatStore.getState>['messages'][number];
  onSave: (product: ProductResponse) => void;
  savedProducts: ProductResponse[];
  suggestions: string[];
  onLoadMore: (messageId: string) => void;
  onFollowUp: (prompt: string) => void;
}) {
  const router = useRouter();
  const products = Array.isArray(message.products) ? message.products : [];
  const paging = message.recommendation_paging;
  const time = formatMessageTime(message.timestamp);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-3"
    >
      {/* Brand eyebrow */}
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ background: 'linear-gradient(135deg, #534AB7, #1D9E75)' }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#534AB7]">
          Pivota · {time}
        </span>
      </div>

      {message.content ? (
        <p className="text-[14px] leading-relaxed whitespace-pre-line text-foreground">{message.content}</p>
      ) : null}

      {message.decision ? <DecisionComparison report={message.decision} onSave={onSave} savedProducts={savedProducts} /> : null}

      {message.decision && paging?.hasMore ? <button type="button" onClick={() => onLoadMore(message.id)} disabled={Boolean(paging.isLoadingMore)} className="rounded-full border border-border px-4 py-2 text-sm disabled:opacity-50">{paging.isLoadingMore ? 'Loading more…' : 'Load more candidates'}</button> : null}

      {products.length > 0 && !message.decision ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:gap-5">
            {products.map((product) => {
              const href = buildProductHrefForProduct(product);
              return (
                <Link
                  key={buildProductKey(product)}
                  href={href}
                  prefetch={false}
                  onClick={(event) => {
                    if (event.defaultPrevented) return;
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    router.push(appendCurrentPathAsReturn(href));
                  }}
                  className="block"
                >
                  <ProductCard
                    image={normalizeDisplayImageUrl(product.image_url, '/placeholder.svg')}
                    imageAlt={product.title}
                    brand={product.brand || null}
                    title={product.title}
                    priceLabel={formatPriceLabel(product.price, product.currency)}
                    onSave={() => onSave(product)}
                    saved={savedProducts.some((saved) => productKey(saved) === productKey(product))}
                    aspect="4/5"
                    font="sans"
                  />
                </Link>
              );
            })}
          </div>

          <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onFollowUp(prompt)}
                className="flex-shrink-0 rounded-full border border-[#534AB7]/20 bg-[#EEEDFE] px-3 py-1.5 text-[11px] font-medium text-[#534AB7] transition-opacity active:opacity-70"
              >
                {prompt}
              </button>
            ))}
          </div>

          {paging?.hasMore ? (
            <button
              type="button"
              onClick={() => onLoadMore(message.id)}
              disabled={Boolean(paging.isLoadingMore)}
              className={cn(
                'mt-1 flex w-full items-center justify-center rounded-full border border-border bg-white py-2.5',
                'text-[11px] font-medium text-muted-foreground',
                'transition-colors hover:border-[#534AB7]/30 hover:text-[#534AB7] disabled:opacity-50',
              )}
            >
              {paging.isLoadingMore ? 'Loading more…' : 'Load more from the edit'}
            </button>
          ) : null}
        </>
      ) : null}
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: 'linear-gradient(135deg, #534AB7, #1D9E75)' }}
      />
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#534AB7]">
        Pivota · thinking
      </span>
      <span aria-hidden="true" className="inline-flex gap-1 text-muted-foreground">
        <span className="animate-bounce">●</span>
        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
      </span>
    </motion.div>
  );
}

// Silence unused warnings — these icons may come back when desktop right
// rail (bag preview + saved this week) lands as a follow-up.
void Heart;
