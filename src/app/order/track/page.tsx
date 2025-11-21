'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Package, Truck, CheckCircle, Clock } from 'lucide-react'

function TrackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')

  // Mock order status - in production this would come from API
  const orderStatus = {
    order_id: orderId || 'ORD_SAMPLE_123',
    status: 'processing',
    created_at: new Date().toISOString(),
    estimated_delivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    tracking_events: [
      {
        status: 'Order Placed',
        date: new Date().toISOString(),
        description: 'Your order has been received',
        completed: true
      },
      {
        status: 'Processing',
        date: new Date().toISOString(),
        description: 'Preparing your items for shipment',
        completed: true,
        current: true
      },
      {
        status: 'Shipped',
        date: null,
        description: 'On the way to you',
        completed: false
      },
      {
        status: 'Delivered',
        date: null,
        description: 'Package delivered',
        completed: false
      }
    ]
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Track Your Order</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Order {orderStatus.order_id}</h2>
            <p className="text-gray-600">
              Estimated delivery: {new Date(orderStatus.estimated_delivery).toLocaleDateString()}
            </p>
          </div>

          <div className="space-y-6">
            {orderStatus.tracking_events.map((event, index) => {
              const Icon = event.current ? Truck : event.completed ? CheckCircle : Clock
              
              return (
                <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      event.completed 
                        ? event.current ? 'bg-blue-500' : 'bg-green-500'
                        : 'bg-gray-200'
                    }`}>
                      <Icon className={`w-5 h-5 ${
                        event.completed ? 'text-white' : 'text-gray-400'
                      }`} />
                    </div>
                    {index < orderStatus.tracking_events.length - 1 && (
                      <div className={`w-0.5 h-16 ${
                        event.completed ? 'bg-green-500' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className={`font-semibold ${
                      event.completed ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {event.status}
                    </h3>
                    <p className="text-sm text-gray-600">{event.description}</p>
                    {event.date && (
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(event.date).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-8 flex gap-4">
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Continue Shopping
            </button>
            <button
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tracking info...</p>
        </div>
      </main>
    }>
      <TrackContent />
    </Suspense>
  )
}
