import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  product_id: string
  title: string
  price: number
  quantity: number
  image_url?: string
  merchant_id?: string
}

interface CartStore {
  items: CartItem[]
  addToCart: (product: Omit<CartItem, 'quantity'>, quantity?: number) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  getTotal: () => number
  getItemCount: () => number
  isInCart: (productId: string) => boolean
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      
      addToCart: (product, quantity = 1) => {
        set((state) => {
          const existingItem = state.items.find(item => item.product_id === product.product_id)
          
          if (existingItem) {
            // Update quantity if already in cart
            return {
              items: state.items.map(item =>
                item.product_id === product.product_id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              )
            }
          }
          
          // Add new item
          return {
            items: [...state.items, { ...product, quantity }]
          }
        })
      },
      
      removeFromCart: (productId) => {
        set((state) => ({
          items: state.items.filter(item => item.product_id !== productId)
        }))
      },
      
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(productId)
          return
        }
        
        set((state) => ({
          items: state.items.map(item =>
            item.product_id === productId
              ? { ...item, quantity }
              : item
          )
        }))
      },
      
      clearCart: () => {
        set({ items: [] })
      },
      
      getTotal: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0)
      },
      
      getItemCount: () => {
        return get().items.reduce((count, item) => count + item.quantity, 0)
      },
      
      isInCart: (productId) => {
        return get().items.some(item => item.product_id === productId)
      }
    }),
    {
      name: 'pivota-cart-storage',
      partialize: (state) => ({ items: state.items }),
      // Cart expires after 7 days
      version: 1,
    }
  )
)
