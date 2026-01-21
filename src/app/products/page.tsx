'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, Sparkles, Package } from 'lucide-react';
import Link from 'next/link';
import ProductCard from '@/components/product/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCartStore } from '@/store/cartStore';
import { sendMessage, getAllProducts, type ProductResponse } from '@/lib/api';
import { toast } from 'sonner';

const FALLBACK_TRENDS = ['Hoodies', 'Water Bottles', 'Tech'] as const;
const GENERIC_CATEGORIES = new Set([
  'general',
  'misc',
  'miscellaneous',
  'other',
  'unknown',
  'default',
]);

function normalizeCategoryLabel(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw : '';
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed
    .split(/[/>|,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const leaf = parts.length > 0 ? parts[parts.length - 1] : trimmed;
  const label = leaf.replace(/\s+/g, ' ').trim();
  if (!label) return null;

  const key = label.toLowerCase();
  if (GENERIC_CATEGORIES.has(key)) return null;
  if (label.length > 28) return null;

  return label;
}

function deriveTrendingCategories(
  products: ProductResponse[],
  limit = 5,
): string[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const product of products) {
    const label = normalizeCategoryLabel(product.category);
    if (!label) continue;

    const key = label.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { label, count: 1 });
    }
  }

  const sorted = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .map((item) => item.label);

  return (sorted.length ? sorted : [...FALLBACK_TRENDS]).slice(0, limit);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [trends, setTrends] = useState<string[]>([...FALLBACK_TRENDS]);
  const { items, open } = useCartStore();

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    loadAllProducts();
  }, []);

  const loadAllProducts = async () => {
    setLoading(true);
    try {
      const data = await getAllProducts(48);
      setProducts(data);
      setTrends(deriveTrendingCategories(data));
    } catch (error) {
      console.error('Failed to load products:', error);
      toast.error('Unable to load products. Please try again.');
      setProducts([]);
      setTrends([...FALLBACK_TRENDS]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      loadAllProducts();
      return;
    }

    setLoading(true);
    try {
      const results = await sendMessage(query);
      setProducts(results);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Failed to search products');
    } finally {
      setLoading(false);
    }
  };

  const handleTrendingClick = (trend: string) => {
    handleSearch(trend);
  };

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
            <Link href="/">
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-3xl md:text-4xl font-semibold mb-2">
            Browse Products
          </h1>
          <p className="text-muted-foreground mb-4">
            Discover our curated collection of premium products
          </p>

          {/* Search */}
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-2xl px-4 py-3">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search products..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Trending */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Trending:</span>
            {trends.map((trend) => (
              <Badge
                key={trend}
                variant="gradient"
                className="cursor-pointer hover:scale-105 transition-transform"
                onClick={() => handleTrendingClick(trend)}
              >
                {trend}
              </Badge>
            ))}
          </div>
        </motion.div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="flex gap-2">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              No products found matching your search.
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            <AnimatePresence>
              {products.map((product, index) => {
                const defaultVariant =
                  Array.isArray(product.variants) && product.variants.length > 0
                    ? product.variants[0]
                    : null;
                const variantId =
                  String(
                    (product as any).variant_id ||
                      (defaultVariant as any)?.variant_id ||
                      (defaultVariant as any)?.id ||
                      (product as any).product_ref?.variant_id ||
                      '',
                  ).trim() || undefined;
                const sku =
                  String(
                    (defaultVariant as any)?.sku ||
                      (defaultVariant as any)?.sku_id ||
                      (product as any).sku ||
                      (product as any).sku_id ||
                      '',
                  ).trim() || undefined;

                return (
                  <motion.div
                    key={product.product_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <ProductCard
                      product_id={product.product_id}
                      merchant_id={product.merchant_id}
                      merchant_name={product.merchant_name}
                      variant_id={variantId}
                      sku={sku}
                      external_redirect_url={product.external_redirect_url}
                      title={product.title}
                      price={product.price}
                      currency={product.currency}
                      image={product.image_url || '/placeholder.svg'}
                      description={product.description}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  );
}
