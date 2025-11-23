'use client';

import { useState, use } from 'react';
import { motion } from 'framer-motion';
import { Star, Truck, RotateCcw, Shield, Minus, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import ProductCard from '@/components/product/ProductCard';
import { useCartStore } from '@/store/cartStore';
import { mockProducts, DEFAULT_MERCHANT_ID } from '@/lib/mockData';
import { toast } from 'sonner';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: Props) {
  const { id } = use(params);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  
  const { addItem, items, open } = useCartStore();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  
  const allProducts = mockProducts[DEFAULT_MERCHANT_ID] || [];
  const product = allProducts.find((p) => p.product_id === id);
  
  if (!product) {
    notFound();
  }

  const relatedProducts = allProducts.filter((p) => p.product_id !== id).slice(0, 6);

  const handleAddToCart = () => {
    addItem({
      id: product.product_id,
      title: product.title,
      price: product.price,
      imageUrl: product.image_url || '/placeholder.svg',
      quantity,
    });
    toast.success(`✓ Added ${quantity}x ${product.title} to cart!`);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    open();
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

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href="/products" className="hover:text-foreground transition-colors">
            Products
          </Link>
          <span>/</span>
          <span>{product.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-24">
          {/* Left: Image */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <GlassCard className="p-0 overflow-hidden">
              <div className="aspect-square relative">
                <Image
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            </GlassCard>
          </motion.div>

          {/* Right: Product Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-6"
          >
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold mb-4">
                {product.title}
              </h1>
              <div className="flex items-center gap-2 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
                <span className="text-sm text-muted-foreground ml-2">
                  4.5 (24 reviews)
                </span>
              </div>
            </div>

            <div>
              <div className="text-4xl font-semibold mb-2">${product.price}</div>
              <p className="text-success text-sm">✓ In Stock</p>
            </div>

            <p className="leading-relaxed text-muted-foreground">
              {product.description}
            </p>

            {/* Features */}
            <GlassCard className="p-4">
              <div className="space-y-3">
                {[
                  { icon: Truck, text: 'Free Shipping' },
                  { icon: RotateCcw, text: '30-Day Returns' },
                  { icon: Shield, text: 'Secure Checkout' },
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <feature.icon className="h-5 w-5 text-cyan-400" />
                    <span className="text-sm">{feature.text}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Quantity */}
            <div>
              <label className="text-sm font-medium mb-3 block">Quantity</label>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-lg font-semibold w-12 text-center">
                  {quantity}
                </span>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={handleAddToCart}
              >
                Add to Cart
              </Button>
              <Button
                variant="gradient"
                size="lg"
                className="flex-1"
                onClick={handleBuyNow}
              >
                Buy Now
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Related Products */}
        <div>
          <h2 className="text-2xl font-semibold mb-8">You might also like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {relatedProducts.map((p) => (
              <ProductCard
                key={p.product_id}
                product_id={p.product_id}
                title={p.title}
                price={p.price}
                image={p.image_url || '/placeholder.svg'}
                description={p.description}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
