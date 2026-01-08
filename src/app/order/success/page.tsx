'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Package, ArrowRight } from 'lucide-react'
import { safeReturnUrl, withReturnParams } from '@/lib/returnUrl'

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const rawReturn =
    searchParams.get('return') ||
    searchParams.get('returnUrl') ||
    searchParams.get('return_url')
  const returnUrl = safeReturnUrl(rawReturn)
  const hasReturnHint = Boolean(rawReturn && !returnUrl)

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Order Successful!</h1>
        <p className="text-gray-600 mb-6">
          Thank you for shopping with Pivota. Your order has been confirmed.
        </p>
        
        {orderId && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-1">Order Number</p>
            <p className="font-mono font-bold text-lg">{orderId}</p>
          </div>
        )}
        
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 text-gray-600">
            <Package className="w-5 h-5" />
            <span>Estimated delivery: 3-5 business days</span>
          </div>
          
          <p className="text-sm text-gray-500">
            You&apos;ll receive a confirmation email with tracking information.
          </p>
        </div>
        
        <div className="mt-8 space-y-3">
          {(returnUrl || hasReturnHint) && (
            <button
              onClick={() => {
                if (!returnUrl) {
                  // When a return param exists but is not allowed, avoid routing into Pivota Shopping.
                  // Best-effort: close tab/window; otherwise user can manually go back.
                  window.close()
                  return
                }
                const url = orderId
                  ? withReturnParams(returnUrl, { checkout: 'success', orderId })
                  : returnUrl
                window.location.assign(url)
              }}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Return to previous page
            </button>
          )}
          {!returnUrl && !hasReturnHint && (
            <>
              <button
                onClick={() => router.push(`/order/track?orderId=${orderId}`)}
                className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                Track Your Order
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => router.push('/')}
                className="w-full px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Continue Shopping
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    }>
      <SuccessContent />
    </Suspense>
  )
}
