'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Package, Truck, CheckCircle, Clock } from 'lucide-react';
import { getOrderStatus } from '@/lib/api';

type TimelineEntry = {
  status: string;
  timestamp?: string | null;
  description?: string | null;
  completed?: boolean;
};

function TrackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<any | null>(null);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    getOrderStatus(orderId)
      .then((data) => {
        const t = (data as any).tracking || (data as any).order || null;
        setTracking(t);
      })
      .catch((err) => {
        console.error('Failed to load tracking', err);
        setError('Failed to load order status. Please retry.');
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  const timeline: TimelineEntry[] = useMemo(() => {
    if (!tracking?.timeline) return [];
    return tracking.timeline.map((e: any) => ({
      status: e.status,
      timestamp: e.timestamp,
      description: e.description,
      completed: Boolean(e.completed),
    }));
  }, [tracking]);

  const estimated = tracking?.estimated_delivery;
  const displayOrderId = orderId || tracking?.order_id || 'ORD_UNKNOWN';

  const renderBody = () => {
    if (!orderId) {
      return (
        <div className="p-6 text-center text-gray-600">
          Provide an orderId query param to track an order.
        </div>
      );
    }

    if (loading) {
      return (
        <div className="p-6 text-center text-gray-600">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          Loading tracking info...
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-6 text-center text-red-600">
          {error}
          <div className="text-sm text-gray-500 mt-2">
            Make sure the order exists and your API key has access.
          </div>
        </div>
      );
    }

    if (!tracking) {
      return (
        <div className="p-6 text-center text-gray-600">
          No tracking info available yet.
        </div>
      );
    }

    const events = timeline.length
      ? timeline
      : [
          {
            status: tracking.delivery_status || tracking.fulfillment_status || 'ordered',
            timestamp: tracking.updated_at || tracking.created_at,
            description: 'Order status updated',
            completed: Boolean(tracking.payment_status === 'paid'),
          },
        ];

    return (
      <>
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Order {displayOrderId}</h2>
          {estimated && (
            <p className="text-gray-600">
              Estimated delivery: {new Date(estimated).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="space-y-6">
          {events.map((event, index) => {
            const Icon = event.completed ? CheckCircle : event.status === 'shipped' ? Truck : Clock;

            return (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      event.completed ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        event.completed ? 'text-white' : 'text-gray-400'
                      }`}
                    />
                  </div>
                  {index < events.length - 1 && (
                    <div
                      className={`w-0.5 h-16 ${
                        event.completed ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>

                <div className="flex-1">
                  <h3
                    className={`font-semibold ${
                      event.completed ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {event.status}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {event.description || 'Status update'}
                  </p>
                  {event.timestamp && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex gap-4">
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Continue Shopping
          </button>
          <button className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Contact Support
          </button>
        </div>
      </>
    );
  };

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
        <div className="bg-white rounded-lg shadow-md p-6">{renderBody()}</div>
      </div>
    </main>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading tracking info...</p>
          </div>
        </main>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
