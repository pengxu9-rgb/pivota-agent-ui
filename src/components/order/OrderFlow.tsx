'use client'

import { useEffect, useRef, useState } from 'react'
import { ShoppingCart, CreditCard, Check, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import {
  createOrder,
  processPayment,
  getMerchantId,
  accountsLogin,
  accountsVerify,
} from '@/lib/api'
import { useCartStore } from '@/store/cartStore'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useAuthStore } from '@/store/authStore'
import '@adyen/adyen-web/dist/adyen.css'

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

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = publishableKey ? loadStripe(publishableKey) : null
const ADYEN_CLIENT_KEY =
  process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY ||
  'test_RMFUADZPQBBYJIWI56KVOQSNUUT657ML' // public test key; replace in env for prod
const FORCE_PSP = process.env.NEXT_PUBLIC_FORCE_PSP

function OrderFlowInner({ items, onComplete, onCancel }: OrderFlowProps) {
  const router = useRouter()
  const stripe = useStripe()
  const elements = useElements()
  const { user, setSession } = useAuthStore()
  const clearCart = useCartStore(state => state.clearCart)
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
  const [cardError, setCardError] = useState<string>('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)
  const adyenContainerRef = useRef<HTMLDivElement>(null)
  const [adyenMounted, setAdyenMounted] = useState(false)
  const [paymentActionType, setPaymentActionType] = useState<string | null>(null)
  const [pspUsed, setPspUsed] = useState<string | null>(null)
  const [initialPaymentAction, setInitialPaymentAction] = useState<any>(null)

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const shipping_cost = 0 // Free shipping
  const tax = subtotal * 0.08 // 8% tax
  const total = subtotal + shipping_cost + tax

  // Helper to create order once and hydrate PSP/payment_action state
  const createOrderIfNeeded = async (): Promise<string> => {
    let orderId = createdOrderId
    if (orderId) return orderId

    const merchantId = items[0]?.merchant_id || getMerchantId()

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
      },
      ...(FORCE_PSP ? { preferred_psp: FORCE_PSP } : {})
    })

    console.log('createOrder response', orderResponse)

    orderId = orderResponse.order_id
    setCreatedOrderId(orderId)
    const orderPayment = (orderResponse as any)?.payment || {}
    const orderPaymentAction =
      (orderResponse as any)?.payment_action || orderPayment?.payment_action
    if (orderPaymentAction) {
      setInitialPaymentAction(orderPaymentAction)
      setPaymentActionType(orderPaymentAction?.type || null)
    }
    const orderPsp =
      (orderResponse as any)?.psp ||
      orderPayment?.psp ||
      orderPaymentAction?.psp
    if (orderPsp) {
      setPspUsed(orderPsp)
    }

    return orderId
  }

  // If already logged in, prefill email and skip verification UI
  useEffect(() => {
    if (user?.email) {
      setShipping((prev) => ({ ...prev, email: prev.email || user.email! }))
      setVerifiedEmail(user.email || null)
    }
  }, [user])

  const handleShippingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user && verifiedEmail !== shipping.email.trim()) {
      toast.error('Please verify your email to continue')
      return
    }
    try {
      setIsProcessing(true)
      await createOrderIfNeeded()
      setStep('payment')
    } catch (err: any) {
      console.error('Create order error:', err)
      toast.error(err?.message || 'Failed to create order')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePayment = async () => {
    setIsProcessing(true)
    setCardError('')
    
    try {
      if (!user && verifiedEmail !== shipping.email.trim()) {
        throw new Error('Please verify your email before paying')
      }

      // Step 1: Create order if not already created
      const orderId = await createOrderIfNeeded()
      
      // Step 2: Create/confirm payment intent via gateway
      const paymentResponse = await processPayment({
        order_id: orderId,
        total_amount: total,
        currency: 'USD',
        payment_method: {
          type: 'card'
        },
        return_url: typeof window !== 'undefined' ? `${window.location.origin}/orders/${orderId}` : undefined
      })

      console.log('submit_payment response', paymentResponse)

      const paymentObj = (paymentResponse as any)?.payment || {}
      const action =
        (paymentResponse as any)?.payment_action ||
        paymentObj?.payment_action ||
        initialPaymentAction ||
        null
      setPaymentActionType(action?.type || null)
      setPspUsed(
        (paymentResponse as any)?.psp ||
          paymentObj?.psp ||
          action?.psp ||
          pspUsed ||
          null,
      )
      const redirectUrl =
        action?.url ||
        paymentResponse.redirect_url ||
        paymentResponse.payment?.redirect_url ||
        paymentResponse.next_action?.redirect_url

      const clientSecret =
        action?.client_secret ||
        paymentResponse.client_secret ||
        paymentResponse.payment?.client_secret

      // New unified payment handling
      if (action?.type === 'redirect_url') {
        if (redirectUrl) {
          window.location.href = redirectUrl
          return
        }
        throw new Error('Payment requires redirect, but no URL provided')
      }

      if (action?.type === 'adyen_session') {
        const sessionData = action?.client_secret
        const sessionId = action?.raw?.id || paymentResponse.payment_intent_id || paymentResponse.payment?.payment_intent_id || ''
        const clientKey = action?.raw?.clientKey || ADYEN_CLIENT_KEY

        if (!sessionData || !clientKey) {
          throw new Error('Adyen session missing data')
        }

        if (adyenMounted && adyenContainerRef.current) {
          // Already mounted; do nothing
          setIsProcessing(false)
          return
        }

        try {
          const { default: AdyenCheckout } = await import('@adyen/adyen-web')
          const checkout = await AdyenCheckout({
            clientKey,
            environment: 'test', // use 'live' in production with proper key
            session: {
              id: sessionId,
              sessionData,
            },
            analytics: { enabled: false },
            onPaymentCompleted: () => {
              setStep('confirm')
              toast.success('Payment processed successfully!')
              clearCart()
              router.push(`/orders/${orderId}?paid=1`)
              onComplete?.(orderId)
            },
            onError: (err: any) => {
              console.error('Adyen error:', err)
              toast.error(err?.message || 'Payment failed')
            },
          })

          if (adyenContainerRef.current) {
            checkout.create('dropin').mount(adyenContainerRef.current)
            setAdyenMounted(true)
            setIsProcessing(false)
            return
          } else {
            throw new Error('Payment container not ready')
          }
        } catch (err: any) {
          console.error('Adyen init failed:', err)
          throw err
        }
      }

      // Default / Stripe flow
      if (clientSecret && stripe && elements) {
        const cardElement = elements.getElement(CardElement)
        if (!cardElement) {
          throw new Error('Please enter card details to pay')
        }

        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
          },
        })

        if (result.error) {
          setCardError(result.error.message || 'Payment failed')
          throw new Error(result.error.message || 'Payment failed')
        }

        const status = result.paymentIntent?.status
        if (status === 'succeeded' || status === 'processing') {
          setPaymentId(result.paymentIntent?.id || '')
          setStep('confirm')
          toast.success('Payment processed successfully!')
          clearCart()
          router.push(`/orders/${orderId}?paid=1`)
          if (onComplete) onComplete(orderId)
        } else if (status === 'requires_action') {
          // Stripe will handle 3DS in confirmCardPayment; keep user on page
          toast.message('Additional authentication required', {
            description: 'Please complete the 3D Secure flow if prompted.',
          })
        } else {
          throw new Error(`Payment status: ${status}`)
        }
      } else if (redirectUrl) {
        window.location.href = redirectUrl
      } else {
        setPaymentId(paymentResponse.payment_id || '')
        setStep('confirm')
        toast.success('Payment processed successfully!')
        clearCart()
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
                {!user && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setOtpLoading(true)
                          try {
                            await accountsLogin(shipping.email.trim())
                            setOtpSent(true)
                            toast.success('Code sent to your email')
                          } catch (err: any) {
                            const code = err?.code
                            if (code === 'INVALID_INPUT') toast.error('Please enter a valid email')
                            else if (code === 'RATE_LIMITED')
                              toast.error('Too many requests, please retry later')
                            else toast.error(err?.message || 'Failed to send code')
                          } finally {
                            setOtpLoading(false)
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm"
                        disabled={otpLoading || !shipping.email}
                      >
                        {otpLoading ? 'Sending...' : otpSent ? 'Resend code' : 'Send code'}
                      </button>
                      <input
                        placeholder="6-digit code"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          setOtpLoading(true)
                          try {
                            const data = await accountsVerify(shipping.email.trim(), otp.trim())
                            setSession({
                              user: (data as any).user,
                              memberships: (data as any).memberships || [],
                              active_merchant_id: (data as any).active_merchant_id,
                            })
                            setVerifiedEmail(shipping.email.trim())
                            toast.success('Email verified and logged in')
                          } catch (err: any) {
                            const code = err?.code
                            if (code === 'INVALID_OTP') toast.error('Code invalid or expired')
                            else if (code === 'RATE_LIMITED')
                              toast.error('Too many attempts, please retry later')
                            else toast.error(err?.message || 'Verification failed')
                          } finally {
                            setOtpLoading(false)
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
                        disabled={otpLoading || !otp || !shipping.email}
                      >
                        Verify
                      </button>
                    </div>
                    {verifiedEmail === shipping.email.trim() && (
                      <p className="text-xs text-green-600">Email verified</p>
                    )}
                  </div>
                )}
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
          <div className="mb-3 text-sm text-muted-foreground">
            PSP routed to:{' '}
            <span className="font-medium text-foreground">
              {pspUsed || 'unknown'}
            </span>
            {paymentActionType ? ` (${paymentActionType})` : ' (defaulting to stripe if none)'}
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              <strong>Test Mode:</strong> In production, this would integrate with real payment processors.
            </p>
          </div>
          
          <div className="space-y-4">
            {paymentActionType === 'adyen_session' ? (
              <div className="border rounded-lg p-4">
                <p className="font-medium mb-2">Adyen payment</p>
                <div ref={adyenContainerRef} className="mt-2" />
                {!adyenMounted && (
                  <p className="text-xs text-muted-foreground">
                    A hosted Adyen form will appear here after clicking Pay.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="border rounded-lg p-4 cursor-pointer hover:border-blue-500 transition-colors">
                  <div className="flex items-center">
                    <input type="radio" name="payment" defaultChecked className="mr-3" />
                    <CreditCard className="w-6 h-6 mr-3" />
                    <div>
                      <p className="font-medium">Credit/Debit Card</p>
                      <p className="text-sm text-gray-600">Secure payment</p>
                    </div>
                  </div>
                </div>

                {publishableKey && (
                  <div className="border rounded-lg p-4">
                    <label className="text-sm font-medium text-gray-700">Card Details</label>
                    <div className="mt-2 p-3 border rounded bg-gray-50">
                      <CardElement options={{ hidePostalCode: true }} />
                    </div>
                    {cardError && <p className="text-sm text-red-600 mt-2">{cardError}</p>}
                  </div>
                )}
              </>
            )}
            
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

export default function OrderFlow(props: OrderFlowProps) {
  // If Stripe publishable key is present, wrap with Elements; otherwise render without card input
  if (stripePromise) {
    return (
      <Elements stripe={stripePromise}>
        <OrderFlowInner {...props} />
      </Elements>
    )
  }
  return <OrderFlowInner {...props} />
}
