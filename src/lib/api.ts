// API配置文件 - 连接Pivota Agent Gateway
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://pivota-agent-production.up.railway.app'

// 默认测试商户ID
export const DEFAULT_MERCHANT_ID = 'merch_208139f7600dbf42'

// 是否使用真实API（根据环境变量，默认使用）
const USE_REAL_API = process.env.NEXT_PUBLIC_USE_MOCK !== 'true'

interface SearchProductsPayload {
  search: {
    merchant_id: string
    query: string
    category?: string
    price_min?: number
    price_max?: number
    page?: number
    limit?: number
  }
}

interface ProductResponse {
  product_id: string
  title: string
  description: string
  price: number
  currency: string
  image_url?: string
  category?: string
  in_stock: boolean
}

// 发送聊天消息并获取产品推荐
export async function sendMessage(message: string): Promise<ProductResponse[]> {
  try {
    const response = await fetch(`${API_BASE}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'find_products',
        payload: { 
          search: { 
            merchant_id: DEFAULT_MERCHANT_ID,
            query: message,
            limit: 10
          }
        }
      } as { operation: string; payload: SearchProductsPayload })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `API request failed with status ${response.status}`)
    }
    
    const data = await response.json()
    return data.products || []
  } catch (error) {
    console.error('API Error:', error)
    throw error // Propagate error for UI to handle
  }
}

// 获取单个产品详情
export async function getProductDetail(productId: string) {
  try {
    const response = await fetch(`${API_BASE}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'get_product_detail',
        payload: {
          product: {
            merchant_id: DEFAULT_MERCHANT_ID,
            product_id: productId
          }
        }
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch product detail')
    }
    
    return await response.json()
  } catch (error) {
    console.error('API Error:', error)
    return null
  }
}

// 模拟数据 - 开发时使用
function getMockProducts(query: string): ProductResponse[] {
  const mockProducts = [
    {
      product_id: 'B08N5WRWN2',
      title: 'Echo Dot (5th Gen) Smart Speaker with Alexa',
      description: 'Our best sounding Echo Dot yet - Enjoy an improved audio experience compared to any previous Echo Dot',
      price: 49.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/518cRYanpbL._AC_SL1000_.jpg',
      category: 'Electronics',
      in_stock: true
    },
    {
      product_id: 'B0B7CPSN2K',
      title: 'Stainless Steel Water Bottle - 32oz',
      description: 'Double wall insulated bottle keeps drinks cold for 24 hours or hot for 12 hours',
      price: 24.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/61CGHv1V7AL._AC_SL1500_.jpg',
      category: 'Sports & Outdoors',
      in_stock: true
    },
    {
      product_id: 'B0C5GZMBXJ',
      title: 'Wireless Bluetooth Headphones',
      description: 'Active noise cancelling, 30-hour battery life, comfortable over-ear design',
      price: 79.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/71loDx7fUxL._AC_SL1500_.jpg',
      category: 'Electronics',
      in_stock: true
    }
  ]
  
  // 简单的搜索过滤
  if (query.toLowerCase().includes('water') || query.toLowerCase().includes('bottle')) {
    return [mockProducts[1]]
  } else if (query.toLowerCase().includes('headphone') || query.toLowerCase().includes('audio')) {
    return [mockProducts[2]]
  }
  
  return mockProducts
}

// 创建订单
export async function createOrder(orderData: {
  merchant_id: string
  customer_email: string
  items: Array<{
    merchant_id: string
    product_id: string
    product_title: string
    quantity: number
    unit_price: number
    subtotal: number
  }>
  shipping_address: {
    name: string
    address_line1: string
    address_line2?: string
    city: string
    country: string
    postal_code: string
    phone?: string
  }
  customer_notes?: string
}) {
  try {
    const response = await fetch(`${API_BASE}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'create_order',
        payload: {
          order: orderData
        }
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to create order')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Create Order Error:', error)
    throw error
  }
}

// 处理支付
export async function processPayment(paymentData: {
  order_id: string
  total_amount: number
  currency: string
  payment_method: {
    type: string
  }
}) {
  try {
    const response = await fetch(`${API_BASE}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'submit_payment',
        payload: {
          payment: {
            order_id: paymentData.order_id,
            expected_amount: paymentData.total_amount,
            currency: paymentData.currency,
            payment_method_hint: paymentData.payment_method.type
          }
        }
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to process payment')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Payment Error:', error)
    throw error
  }
}

// 获取订单状态
export async function getOrderStatus(orderId: string) {
  try {
    const response = await fetch(`${API_BASE}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'get_order_status',
        payload: {
          order: { order_id: orderId }
        }
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to get order status')
    }
    
    return await response.json()
  } catch (error) {
    console.error('Order Status Error:', error)
    throw error
  }
}
