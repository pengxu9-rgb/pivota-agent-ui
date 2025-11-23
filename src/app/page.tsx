'use client';

import { useState, useRef, useEffect } from 'react';
import { Menu, ShoppingCart, Send, Sparkles, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { useCartStore } from '@/store/cartStore';
import { useChatStore } from '@/store/chatStore';
import { sendMessage, getAllProducts } from '@/lib/api';
import { toast } from 'sonner';

export default function HomePage() {
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true); // Desktop默认显示
  const [loading, setLoading] = useState(false);
  const [hotDeals, setHotDeals] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, addMessage } = useChatStore();
  const { items, addItem, open } = useCartStore();
  
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
      const products = await sendMessage(input);
      
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: products.length > 0 
          ? `I found ${products.length} product(s) for you!`
          : "I couldn't find any products matching your search. Try something else!",
        products: products.slice(0, 4),
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
    addItem({
      id: product.product_id,
      title: product.title,
      price: product.price,
      imageUrl: product.image_url || '/placeholder.svg',
      quantity: 1,
    });
    toast.success(`✓ Added to cart! ${product.title}`);
  };

  return (
    <div className="flex h-screen w-full bg-gradient-mesh">
      {/* Animated background gradients */}
      <div className="absolute inset-0 -z-10 opacity-40" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-cyan-400/20 blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-l from-cyan-400/20 via-purple-500/30 to-indigo-500/30 blur-3xl -z-10 animate-pulse" />

      {/* Sidebar */}
      <ChatSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 px-4 flex items-center justify-between border-b border-border bg-card/70 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
            >
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-cyan-400" />
              <span className="text-xl font-semibold gradient-text">
                Pivota
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
                <div
                  className={`${
                    idx === 0 && message.role === 'assistant'
                      ? 'text-center max-w-md space-y-3'
                      : message.role === 'user'
                      ? 'max-w-[80%] bg-secondary border border-border rounded-3xl rounded-br-sm px-4 py-3 text-sm'
                      : 'max-w-[80%] bg-primary text-primary-foreground rounded-3xl rounded-bl-sm px-4 py-3 text-sm shadow-lg'
                  }`}
                >
                  {idx === 0 && message.role === 'assistant' ? (
                    <>
                      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                        <span className="gradient-text">Shop Anything</span>
                        <br />
                        <span className="text-foreground">Through Conversation</span>
                      </h1>
                    </>
                  ) : (
                    message.content
                  )}

                  {/* Product Cards */}
                  {message.products && message.products.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 max-w-md">
                      {message.products.map((product, productIdx) => (
                        <motion.div
                          key={product.product_id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: productIdx * 0.1 }}
                          className="group relative bg-card backdrop-blur-xl rounded-xl overflow-hidden border border-border shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300"
                        >
                          {/* Image */}
                          <Link href={`/products/${product.product_id}`} className="block">
                            <div className="relative w-full aspect-square overflow-hidden">
                              <Image
                                src={product.image_url || '/placeholder.svg'}
                                alt={product.title}
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                unoptimized
                              />
                            </div>
                          </Link>

                          {/* Content */}
                          <div className="p-2 flex flex-col">
                            <Link href={`/products/${product.product_id}`}>
                              <h4 className="font-medium text-xs mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                                {product.title}
                              </h4>
                            </Link>

                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-bold text-primary">
                                ${product.price}
                              </span>
                            </div>

                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleAddToCart(product)}
                              className="w-full h-7 text-[10px] font-medium"
                            >
                              Add to Cart
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
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
                    hotDeals.map((product) => (
                      <Link
                        key={product.product_id}
                        href={`/products/${product.product_id}`}
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
                        <p className="text-xs font-semibold">${product.price}</p>
                      </Link>
                    ))
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
