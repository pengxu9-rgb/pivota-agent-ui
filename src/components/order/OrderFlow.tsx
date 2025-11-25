'use client'

import { useState } from 'react'
import { ShoppingCart, CreditCard, Check, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { createOrder, processPayment, getMerchantId } from '@/lib/api'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface OrderItem {
  product_id: string
  merchant_id?: string
  title: string
  quantity: number
  unit_price: number
  image_url?: string
}

interface ShippingInfo {
  name: string
  email: string
  address_line1: string
  address_line2?: string
  city: string
  state?: string
  postal_code: string
  country: string
  phone?: string
}

interface OrderFlowProps {
  items: OrderItem[]
  onComplete?: (orderId: string) => void
  onCancel?: () => void
}

export default function OrderFlow({ items, onComplete, onCancel }: OrderFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<'review' | 'shipping' | 'payment' | 'confirm'>('review')
  const [shipping, setShipping] = useState<ShippingInfo>({
    name: '',
    email: '',
    address_line1: '',
    city: '',
    postal_code: '',
    country: 'US',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [createdOrderId, setCreatedOrderId] = useState<string>('')
  const [paymentId, setPaymentId] = useState<string>('')

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const shipping_cost = 0 // Free shipping
  const tax = subtotal * 0.08 // 8% tax
  const total = subtotal + shipping_cost + tax

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('payment')
  }

  const handlePayment = async () => {
    setIsProcessing(true)
    
    try {
      const merchantId = items[0]?.merchant_id || getMerchantId()

      // Step 1: Create order if not already created
      let orderId = createdOrderId
      if (!orderId) {
        const orderResponse = await createOrder({
          merchant_id: merchantId,
          customer_email: shipping.email,
          items: items.map(item => ({
            merchant_id: item.merchant_id || merchantId,
            product_id: item.product_id,
            product_title: item.title,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.unit_price * item.quantity
          })),
          shipping_address: {
            name: shipping.name,
            address_line1: shipping.address_line1,
            address_line2: shipping.address_line2,
            city: shipping.city,
            country: shipping.country,
            postal_code: shipping.postal_code,
            phone: shipping.phone
          }
        })
        
        orderId = orderResponse.order_id
        setCreatedOrderId(orderId)
      }
      
      // Step 2: Process payment
      const paymentResponse = await processPayment({
        order_id: orderId,
        total_amount: total,
        currency: 'USD',
        payment_method: {
          type: 'card'
        },
        return_url: typeof window !== 'undefined' ? `${window.location.origin}/orders/${orderId}` : undefined
      })

      const redirectUrl =
        paymentResponse.redirect_url ||
        paymentResponse.payment?.redirect_url ||
        paymentResponse.next_action?.redirect_url

      if (redirectUrl) {
        toast.message('Continue to payment', {
          description: 'We will open a secure payment page to finish the charge.',
        })
        window.open(redirectUrl, '_blank')
      } else {
        setPaymentId(paymentResponse.payment_id || '')
        setStep('confirm')
        toast.success('Payment processed successfully!')

        // Navigate to order confirmation/detail to avoid resetting to review
        router.push(`/orders/${orderId}?paid=1`)

        if (onComplete) {
          onComplete(orderId)
        }
      }
    } catch (error: any) {
      console.error('Payment error:', error)
      toast.error(error.message || 'Payment failed. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className={`flex items-center ${step === 'review' ? 'text-blue-600' : 'text-gray-400'}`}>
            <ShoppingCart className="w-6 h-6" />
            <span className="ml-2 font-medium">Review</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center ${step === 'shipping' ? 'text-blue-600' : 'text-gray-400'}`}>
            <CreditCard className="w-6 h-6" />
            <span className="ml-2 font-medium">Shipping</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center ${step === 'payment' ? 'text-blue-600' : 'text-gray-400'}`}>
            <CreditCard className="w-6 h-6" />
            <span className="ml-2 font-medium">Payment</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center ${step === 'confirm' ? 'text-blue-600' : 'text-gray-400'}`}>
            <Check className="w-6 h-6" />
            <span className="ml-2 font-medium">Confirm</span>
          </div>
        </div>
      </div>

      {/* Step Content */}
      {step === 'review' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">Review Your Order</h2>
          
          <div className="space-y-4 mb-6">
            {items.map((item, index) => (
              <div key={index} className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center">
                  {item.image_url && (
                    <Image src={item.image_url} alt={item.title} width={64} height={64} className="w-16 h-16 object-cover rounded mr-4" />
                  )}
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-gray-600">Qty: {item.quantity}</p>
                  </div>
                </div>
                <p className="font-semibold">${(item.unit_price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>
          
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span className="text-green-600">FREE</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="flex justify-between mt-6">
            <button
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => setStep('shipping')}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Continue to Shipping
            </button>
          </div>
        </div>
      )}

      {step === 'shipping' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">Shipping Information</h2>
          
          <form onSubmit={handleShippingSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={shipping.name}
                  onChange={(e) => setShipping({...shipping, name: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={shipping.email}
                  onChange={(e) => setShipping({...shipping, email: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Address Line 1</label>
              <input
                type="text"
                required
                value={shipping.address_line1}
                onChange={(e) => setShipping({...shipping, address_line1: e.target.value})}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Address Line 2 (Optional)</label>
              <input
                type="text"
                value={shipping.address_line2}
                onChange={(e) => setShipping({...shipping, address_line2: e.target.value})}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  type="text"
                  required
                  value={shipping.city}
                  onChange={(e) => setShipping({...shipping, city: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Postal Code</label>
                <input
                  type="text"
                  required
                  value={shipping.postal_code}
                  onChange={(e) => setShipping({...shipping, postal_code: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Country</label>
                <select
                  value={shipping.country}
                  onChange={(e) => setShipping({...shipping, country: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="US">United States</option>
                  <option value="CN">China</option>
                  <option value="UK">United Kingdom</option>
                  <option value="CA">Canada</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={() => setStep('review')}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Continue to Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'payment' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">Payment Method</h2>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              <strong>Test Mode:</strong> In production, this would integrate with real payment processors.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="border rounded-lg p-4 cursor-pointer hover:border-blue-500 transition-colors">
              <div className="flex items-center">
                <input type="radio" name="payment" defaultChecked className="mr-3" />
                <CreditCard className="w-6 h-6 mr-3" />
                <div>
                  <p className="font-medium">Credit/Debit Card</p>
                  <p className="text-sm text-gray-600">Secure payment via Stripe</p>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <h3 className="font-medium mb-4">Order Summary</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <span>Total Amount</span>
                  <span className="font-bold text-lg">${total.toFixed(2)}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <p>Ship to: {shipping.name}</p>
                  <p>{shipping.address_line1}, {shipping.city} {shipping.postal_code}</p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep('shipping')}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isProcessing}
              >
                Back
              </button>
              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : `Pay $${total.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Order Confirmed!</h2>
          <p className="text-gray-600 mb-6">
            Thank you for your purchase. Your order has been received and is being processed.
          </p>
          <p className="text-lg font-medium">
            Order Total: <span className="text-green-600">${total.toFixed(2)}</span>
          </p>
          <p className="mt-4 text-gray-600">
            You will receive an order confirmation email shortly.
          </p>
        </div>
      )}
    </div>
  )
}
