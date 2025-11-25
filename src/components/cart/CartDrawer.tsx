'use client';

import { X, Minus, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cartStore';

export default function CartDrawer() {
  const router = useRouter();
  const { items, isOpen, close, removeItem, updateQuantity, getTotal, clearCart } = useCartStore();

  const handleCheckout = () => {
    if (items.length === 0) return;

    const orderItems = items.map((item) => ({
      product_id: item.id,
      merchant_id: item.merchant_id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.price,
      image_url: item.imageUrl,
    }));

    router.push(`/order?items=${encodeURIComponent(JSON.stringify(orderItems))}`);
    close();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:w-96 bg-card border-l border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Shopping Cart</h2>
              <button
                onClick={close}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <AnimatePresence>
                {items.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-full text-center"
                  >
                    <p className="text-muted-foreground">Your cart is empty</p>
                    <Button
                      variant="gradient"
                      className="mt-4"
                      onClick={() => {
                        close();
                        router.push('/products');
                      }}
                    >
                      Browse Products
                    </Button>
                  </motion.div>
                ) : (
                  items.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex gap-3 p-3 rounded-2xl bg-secondary/50 border border-border"
                    >
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{item.title}</h4>
                        <p className="text-sm font-semibold text-primary">${item.price.toFixed(2)}</p>

                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            className="h-6 w-6 rounded-lg flex items-center justify-center bg-background hover:bg-muted transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="h-6 w-6 rounded-lg flex items-center justify-center bg-background hover:bg-muted transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="ml-auto h-6 w-6 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-border p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">${getTotal().toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="font-semibold text-success">FREE</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-lg font-bold text-primary">
                    ${getTotal().toFixed(2)}
                  </span>
                </div>

                <Button
                  variant="gradient"
                  className="w-full h-12 text-base"
                  onClick={handleCheckout}
                >
                  Checkout
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
