'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OrderFlow from '@/components/order/OrderFlow'
import { ArrowLeft } from 'lucide-react'

interface OrderItem {
  product_id: string
  title: string
  quantity: number
  unit_price: number
  image_url?: string
}

function OrderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])

  useEffect(() => {
    // In a real app, this would come from cart state or API
    // For demo, we'll parse from URL params or use mock data
    const items = searchParams.get('items')
    if (items) {
      try {
        setOrderItems(JSON.parse(decodeURIComponent(items)))
      } catch (e) {
        // Use mock data if parsing fails
        setOrderItems([
          {
            product_id: 'BOTTLE_001',
            title: 'Stainless Steel Water Bottle - 24oz',
            quantity: 1,
            unit_price: 24.99,
            image_url: 'https://m.media-amazon.com/images/I/61CGHv1V7AL._AC_SL1500_.jpg'
          }
        ])
      }
    } else {
      // Mock data for testing
      setOrderItems([
        {
          product_id: 'BOTTLE_001',
          title: 'Stainless Steel Water Bottle - 24oz',
          quantity: 1,
          unit_price: 24.99,
          image_url: 'https://m.media-amazon.com/images/I/61CGHv1V7AL._AC_SL1500_.jpg'
        }
      ])
    }
  }, [searchParams])

  const handleComplete = (orderId: string) => {
    // In production, this would save order to backend
    console.log('Order completed:', orderId)
    
    // Show success message and redirect
    setTimeout(() => {
      router.push(`/order/success?orderId=${orderId}`)
    }, 2000)
  }

  const handleCancel = () => {
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Back to chat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">Pivota Checkout</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="py-8">
        {orderItems.length > 0 ? (
          <OrderFlow 
            items={orderItems}
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">No items in your order</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function OrderPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order...</p>
        </div>
      </main>
    }>
      <OrderContent />
    </Suspense>
  )
}
