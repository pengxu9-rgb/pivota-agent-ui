'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, ShoppingCart, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { useCartStore } from '@/store/cartStore';
import { sendMessage } from '@/lib/api';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: any[];
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Welcome! What can I help you find today?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { items, addItem, open } = useCartStore();
  
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const hasUserMessages = messages.some(msg => msg.role === 'user');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const products = await sendMessage(input);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: products.length > 0 
          ? `I found ${products.length} product(s) for you!`
          : "I couldn't find any products matching your search. Try something else!",
        products: products.slice(0, 4),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Search error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, there was an error searching for products. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (product: any) => {
    addItem({
      id: product.id,
      title: product.title,
      price: product.price,
      imageUrl: product.image_url,
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 px-4 flex items-center justify-between border-b border-border bg-card/70 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-cyan-400" />
              <span className="text-xl font-semibold gradient-text">
                Pivota
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/products">
              <Button variant="icon" size="icon">
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
                          key={product.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: productIdx * 0.1 }}
                          className="group relative bg-card backdrop-blur-xl rounded-xl overflow-hidden border border-border shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300"
                        >
                          {/* Image */}
                          <Link href={`/products/${product.id}`} className="block">
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
                            <Link href={`/products/${product.id}`}>
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
          {!hasUserMessages && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 flex-wrap"
            >
              {['Water bottle', 'Hoodies', 'Electronics'].map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="gradient"
                  className="cursor-pointer hover:scale-105 transition-transform"
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

