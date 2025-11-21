import { NextResponse } from 'next/server'
import { getProductById } from '@/lib/mockData'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const product = getProductById(id)
  
  if (!product) {
    return NextResponse.json(
      { error: 'Product not found' },
      { status: 404 }
    )
  }
  
  // Format response for AI consumption
  const response = {
    product: {
      id: product.product_id,
      name: product.title,
      description: product.description,
      price: {
        amount: product.price,
        currency: product.currency
      },
      availability: product.in_stock ? "in_stock" : "out_of_stock",
      category: product.category,
      image: product.image_url,
      url: `https://agent.pivota.cc/products/${product.product_id}`,
      buy_url: `https://agent.pivota.cc/order?items=${encodeURIComponent(JSON.stringify([{
        product_id: product.product_id,
        title: product.title,
        quantity: 1,
        unit_price: product.price,
        image_url: product.image_url
      }]))}`,
      features: [
        "Free shipping",
        "30-day return policy",
        "Ships within 1-2 business days",
        product.in_stock ? "In stock - ready to ship" : "Currently unavailable"
      ],
      rating: {
        value: 4.5,
        count: 127,
        display: "4.5 out of 5 stars (127 reviews)"
      }
    },
    store: {
      name: "Pivota Shopping AI",
      url: "https://agent.pivota.cc",
      chat_assistant: "https://chatgpt.com/g/g-69201604c1308191b2fc5f23d57e9874-pivota-shopping-assistant"
    },
    metadata: {
      timestamp: new Date().toISOString(),
      supports_ai_agents: true
    }
  }
  
  return NextResponse.json(response, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    }
  })
}
