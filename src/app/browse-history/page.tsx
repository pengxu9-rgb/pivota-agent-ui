'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { History, Sparkles, ShoppingCart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import ProductCard from '@/components/product/ProductCard';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cartStore';

interface HistoryItem {
  product_id: string;
  merchant_id?: string;
  title: string;
  price: number;
  image: string;
  description?: string;
  timestamp: number;
}

export default function BrowseHistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const { items, open } = useCartStore();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    // Load browse history from localStorage
    const savedHistory = localStorage.getItem('browse_history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        // Sort by timestamp descending (most recent first)
        const sorted = parsed.sort((a: HistoryItem, b: HistoryItem) => b.timestamp - a.timestamp);
        setHistory(sorted);
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }, []);

  const clearHistory = () => {
    localStorage.removeItem('browse_history');
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-gradient-mesh overflow-x-hidden relative">
      {/* Animated background */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-400/10 blur-3xl -z-10 animate-pulse" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/70 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Sparkles className="h-6 w-6 text-cyan-400 group-hover:rotate-12 transition-transform" />
            <span className="text-xl font-semibold gradient-text">Pivota</span>
          </Link>

          <div className="flex items-center gap-3">
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <History className="h-8 w-8 text-cyan-400" />
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold">
                  Browse History
                </h1>
                <p className="text-muted-foreground mt-1">
                  {history.length} {history.length === 1 ? 'product' : 'products'} viewed
                </p>
              </div>
            </div>

            {history.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistory}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear History
              </Button>
            )}
          </div>
        </motion.div>

        {/* History Grid */}
        {history.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <History className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No browsing history yet</h2>
            <p className="text-muted-foreground mb-6">
              Start exploring products to see them here
            </p>
            <Link href="/products">
              <Button variant="gradient">
                Browse Products
              </Button>
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            {history.map((item, index) => (
              <motion.div
                key={`${item.product_id}-${item.timestamp}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <ProductCard
                  product_id={item.product_id}
                  merchant_id={item.merchant_id}
                  title={item.title}
                  price={item.price}
                  image={item.image}
                  description={item.description}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
