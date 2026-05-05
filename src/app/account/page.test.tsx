import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AccountPage from './page'

const replaceMock = vi.fn()
const accountsMeMock = vi.fn()
const accountsSetPasswordMock = vi.fn()
const accountsLogoutMock = vi.fn()
const setSessionMock = vi.fn()
const clearMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

let authUser: any = null

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}))

vi.mock('next/link', () => ({
  default: (props: any) => <a href={props.href}>{props.children}</a>,
}))

vi.mock('@/lib/api', () => ({
  accountsMe: (...args: unknown[]) => accountsMeMock(...args),
  accountsSetPassword: (...args: unknown[]) => accountsSetPasswordMock(...args),
  accountsLogout: (...args: unknown[]) => accountsLogoutMock(...args),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    user: authUser,
    setSession: setSessionMock,
    clear: clearMock,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

describe('AccountPage password setup', () => {
  beforeEach(() => {
    authUser = {
      id: 'user_1',
      email: 'buyer@example.com',
      has_password: false,
    }
    replaceMock.mockReset()
    accountsMeMock.mockReset()
    accountsSetPasswordMock.mockReset()
    accountsLogoutMock.mockReset()
    setSessionMock.mockReset()
    clearMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    accountsMeMock.mockResolvedValue({
      user: authUser,
      memberships: [],
      active_merchant_id: null,
    })
    accountsSetPasswordMock.mockResolvedValue({})
  })

  afterEach(() => {
    cleanup()
  })

  it('redirects home after saving a new password', async () => {
    render(<AccountPage />)

    await screen.findByLabelText('New password')

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password-123' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'new-password-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(accountsSetPasswordMock).toHaveBeenCalledWith('new-password-123', undefined)
      expect(toastSuccessMock).toHaveBeenCalledWith('Password saved')
      expect(replaceMock).toHaveBeenCalledWith('/')
    })
  })
})
