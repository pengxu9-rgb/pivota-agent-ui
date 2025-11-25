import { create } from 'zustand'
import { AccountsUser, Membership } from '@/lib/api'

type AuthState = {
  user: AccountsUser | null
  memberships: Membership[]
  activeMerchantId: string | null
  setSession: (payload: { user: AccountsUser; memberships: Membership[]; active_merchant_id?: string | null }) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  memberships: [],
  activeMerchantId: null,
  setSession: ({ user, memberships, active_merchant_id }) =>
    set({ user, memberships, activeMerchantId: active_merchant_id || null }),
  clear: () => set({ user: null, memberships: [], activeMerchantId: null }),
}))
