'use client';

import { motion } from 'framer-motion';
import { Package, ShoppingCart, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { useCartStore } from '@/store/cartStore';

export default function OrdersPage() {
  const { items, open } = useCartStore();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-mesh">
      {/* Animated background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-400/10 blur-3xl -z-10 animate-pulse" />

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
      <main className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-semibold mb-2">My Orders</h1>
          <p className="text-muted-foreground mb-8">
            Track and manage your Pivota orders
          </p>

          {/* Orders List - Coming Soon */}
          <GlassCard className="p-8 text-center">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Orders Yet</h2>
            <p className="text-muted-foreground mb-6">
              Start shopping to see your orders here
            </p>
            <Link href="/products">
              <Button variant="gradient">
                Browse Products
              </Button>
            </Link>
          </GlassCard>
        </motion.div>
      </main>
    </div>
  );
}

