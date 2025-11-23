'use client';

import { useState, useEffect } from 'react';
import { History, Trash2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ProductCard from '@/components/product/ProductCard';
import { getAllProducts } from '@/lib/api';

export default function BrowseHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        // Get history from localStorage
        const historyIds = JSON.parse(localStorage.getItem('pivota-browse-history') || '[]');
        
        if (historyIds.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch product details
        const allProducts = await getAllProducts(100);
        const historyProducts = historyIds
          .map((id: string) => allProducts.find(p => p.product_id === id))
          .filter(Boolean);
          
        setHistory(historyProducts);
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  const clearHistory = () => {
    localStorage.removeItem('pivota-browse-history');
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-gradient-mesh">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Browse History</h1>
              <p className="text-muted-foreground">
                Products you've recently viewed
              </p>
            </div>
            {history.length > 0 && (
              <Button variant="outline" onClick={clearHistory} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear History
              </Button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-muted/20 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 bg-card/50 backdrop-blur-xl rounded-3xl border border-border">
              <History className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No history yet</h3>
              <p className="text-muted-foreground mb-4">
                Start exploring products to see your history here
              </p>
              <Link href="/products">
                <Button variant="gradient">
                  Explore Products <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {history.map((product, index) => (
                <motion.div
                  key={product.product_id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <ProductCard
                    product_id={product.product_id}
                    title={product.title}
                    price={product.price}
                    image={product.image_url || '/placeholder.svg'}
                    description={product.description}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
