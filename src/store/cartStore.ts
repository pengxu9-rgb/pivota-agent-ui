import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  id: string
  product_id?: string
  variant_id?: string
  sku?: string
  selected_options?: Record<string, string>
  offer_id?: string
  title: string
  price: number
  currency?: string
  quantity: number
  imageUrl: string
  merchant_id?: string
}

/**
 * The bag's subtotal is a MONEY value, so it exists only when every line is in ONE currency.
 * A bag that holds lines in two currencies (a buyer who switched market with items from the
 * old one still in the bag; the 2026-10-09 located-market change made that reachable) has no
 * subtotal: the drawer says so and checkout is refused, rather than adding ¥3,500 to $23.
 */
export type CartSubtotal =
  | { mixed: false; amount: number; currency: string | null }
  | { mixed: true; currencies: string[] }

/** The pre-market storefront minted every line in USD; a line that names no currency is one of those. */
export const LEGACY_CART_CURRENCY = 'USD'

export function normalizeCartCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export function cartCurrencies(items: CartItem[]): string[] {
  return [...new Set(items.map((item) => normalizeCartCurrency(item.currency) || LEGACY_CART_CURRENCY))]
}

export function cartSubtotal(items: CartItem[]): CartSubtotal {
  const currencies = cartCurrencies(items)
  if (currencies.length > 1) return { mixed: true, currencies }
  return {
    mixed: false,
    amount: items.reduce((total, item) => total + item.price * item.quantity, 0),
    currency: currencies[0] ?? null,
  }
}

interface CartStore {
  items: CartItem[]
  isOpen: boolean
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  getSubtotal: () => CartSubtotal
  open: () => void
  close: () => void
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      
      addItem: (newItem) => {
        if (newItem?.merchant_id === 'external_seed') {
          return;
        }
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
          
          // Add new item, with its currency normalised: every line carries one, so the subtotal can be a money value.
          return {
            items: [...state.items, { ...newItem, currency: normalizeCartCurrency(newItem.currency) || LEGACY_CART_CURRENCY }]
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
      
      getSubtotal: () => cartSubtotal(get().items),
      
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
      version: 3,
      // v2 -> v3: lines persisted before every line carried a currency were minted by the USD-only storefront.
      migrate: (persisted, version) => {
        const state = (persisted && typeof persisted === 'object' ? persisted : {}) as { items?: CartItem[] }
        const items = Array.isArray(state.items) ? state.items : []
        if (version >= 3) return { ...state, items }
        return {
          ...state,
          items: items.map((item) => ({ ...item, currency: normalizeCartCurrency(item.currency) || LEGACY_CART_CURRENCY })),
        }
      },
    }
  )
)
