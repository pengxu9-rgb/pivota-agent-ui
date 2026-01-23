'use client';

import { useState, useRef, useEffect } from 'react';
import { Menu, ShoppingCart, Send, Package, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { ChatRecommendationCard } from '@/components/product/ChatRecommendationCard';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { sendMessage, getAllProducts, type ProductResponse } from '@/lib/api';
import { toast } from 'sonner';

export default function HomePage() {
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile: closed by default, Desktop: always visible
  const [loading, setLoading] = useState(false);
  const [hotDeals, setHotDeals] = useState<ProductResponse[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, addMessage, conversations, resetForGuest } = useChatStore();
  const { items, addItem, open } = useCartStore();
  const { user } = useAuthStore();
  const { ownerEmail, setOwnerEmail } = useChatStore();
  
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const hasUserMessages = messages.some(msg => msg.role === 'user');

  // 加载Hot Deals商品
  useEffect(() => {
    const loadHotDeals = async () => {
      try {
        const products = await getAllProducts(6);
        setHotDeals(products);
      } catch (error) {
        console.error('Failed to load hot deals:', error);
        // Keep empty array if API fails
      }
    };
    loadHotDeals();
  }, []);

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
    if (!input.trim() || loading) return;

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

      const products = await sendMessage(
        input,
        undefined,
        evalMetadata ? { metadata: evalMetadata } : undefined,
      );
      
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: products.length > 0 
          ? `I found ${products.length} product(s) for you!`
          : "I couldn't find any products matching your search. Try something else!",
        products: products.slice(0, 10),
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
      imageUrl: product.image_url || '/placeholder.svg',
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
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground truncate max-w-[160px]">
                    {user.email || user.id}
                  </span>
                </div>
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
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-semibold text-white">
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
                  <div className="max-w-[80%] space-y-2">
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
                        <p className="text-[11px] text-muted-foreground">
                          Recommended pieces based on this chat:
                        </p>
                        <div className="flex gap-3 overflow-x-auto pb-1 pr-1 snap-x snap-mandatory scroll-smooth">
                          {message.products.slice(0, 10).map((product) => (
                            <div
                              key={product.product_id}
                              className="w-[220px] flex-shrink-0 snap-start"
                            >
                              <ChatRecommendationCard
                                product={product}
                                onAddToCart={handleAddToCart}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {loading && (
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
                      const cardHref = product.merchant_id
                        ? `/products/${product.product_id}?merchant_id=${encodeURIComponent(product.merchant_id)}`
                        : `/products/${product.product_id}`;
                      return (
                      <Link
                        key={product.product_id}
                        href={cardHref}
                        className="flex-shrink-0 w-24 group"
                      >
                        <div className="relative aspect-square rounded-2xl overflow-hidden mb-2 ring-1 ring-border group-hover:ring-primary transition-all">
                          <Image
                            src={product.image_url || '/placeholder.svg'}
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
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading products...</p>
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
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask me anything..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
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
