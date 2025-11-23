'use client'

import { ShoppingCart } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'

interface CartButtonProps {
  onClick: () => void
}

export default function CartButton({ onClick }: CartButtonProps) {
  const items = useCartStore((state) => state.items)
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0)

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110 z-30"
      aria-label="Shopping cart"
    >
      <ShoppingCart className="w-6 h-6" />
      {itemCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  )
}
