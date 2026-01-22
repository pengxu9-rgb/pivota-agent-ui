import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  id: string
  product_id?: string
  variant_id?: string
  sku?: string
  offer_id?: string
  title: string
  price: number
  currency?: string
  quantity: number
  imageUrl: string
  merchant_id?: string
}

interface CartStore {
  items: CartItem[]
  isOpen: boolean
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  getTotal: () => number
  open: () => void
  close: () => void
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      
      addItem: (newItem) => {
        set((state) => {
          const existingItem = state.items.find(item => item.id === newItem.id)
          
          if (existingItem) {
            // Update quantity if already in cart
            return {
              items: state.items.map(item =>
                item.id === newItem.id
                  ? { ...item, quantity: item.quantity + newItem.quantity }
                  : item
              )
            }
          }
          
          // Add new item
          return {
            items: [...state.items, newItem]
          }
        })
      },
      
      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter(item => item.id !== id)
        }))
      },
      
      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id)
          return
        }
        
        set((state) => ({
          items: state.items.map(item =>
            item.id === id
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
      
      open: () => {
        set({ isOpen: true })
      },
      
      close: () => {
        set({ isOpen: false })
      },
    }),
    {
      name: 'pivota-cart-storage',
      partialize: (state) => ({ items: state.items }),
      version: 2,
    }
  )
)
