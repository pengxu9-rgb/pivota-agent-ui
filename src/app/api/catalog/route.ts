import { NextResponse } from 'next/server'
import { mockProducts } from '@/lib/mockData'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  const category = searchParams.get('category')
  const maxPrice = searchParams.get('max_price')
  const minPrice = searchParams.get('min_price')
  
  let products = mockProducts['merch_208139f7600dbf42']
  
  // Filter by search query
  if (query) {
    const searchTerm = query.toLowerCase()
    products = products.filter(p =>
      p.title.toLowerCase().includes(searchTerm) ||
      p.description.toLowerCase().includes(searchTerm) ||
      p.category.toLowerCase().includes(searchTerm)
    )
  }
  
  // Filter by category
  if (category) {
    products = products.filter(p => p.category === category)
  }
  
  // Filter by price range
  if (maxPrice) {
    products = products.filter(p => p.price <= Number(maxPrice))
  }
  if (minPrice) {
    products = products.filter(p => p.price >= Number(minPrice))
  }
  
  // Format response for AI consumption
  const response = {
    store: {
      name: "Pivota Shopping AI",
      url: "https://agent.pivota.cc",
      description: "AI-powered shopping platform with verified products and secure checkout",
      features: ["Natural language search", "AI recommendations", "Secure payment", "Fast shipping"]
    },
    products: products.map(p => ({
      id: p.product_id,
      name: p.title,
      description: p.description,
      price: {
        amount: p.price,
        currency: p.currency
      },
      availability: p.in_stock ? "in_stock" : "out_of_stock",
      category: p.category,
      image: p.image_url,
      url: `https://agent.pivota.cc/products/${p.product_id}`,
      buy_url: `https://agent.pivota.cc/order?items=${encodeURIComponent(JSON.stringify([{
        product_id: p.product_id,
        title: p.title,
        quantity: 1,
        unit_price: p.price,
        image_url: p.image_url
      }]))}`,
      features: [
        "Free shipping",
        "30-day return policy",
        "Ships within 1-2 business days"
      ],
      why_recommended: `This ${p.title} is ${p.in_stock ? 'in stock' : 'currently unavailable'} and priced at $${p.price}. ${p.description.split('.')[0]}.`,
      use_cases: generateUseCases(p.category, p.title)
    })),
    total_count: products.length,
    metadata: {
      timestamp: new Date().toISOString(),
      api_version: "1.0",
      supports_ai_agents: true,
      checkout_flow: "https://agent.pivota.cc/order",
      chat_assistant: "https://chatgpt.com/g/g-69201604c1308191b2fc5f23d57e9874-pivota-shopping-assistant"
    }
  }
  
  return NextResponse.json(response, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    }
  })
}

function generateUseCases(category: string, title: string): string[] {
  const useCases: Record<string, string[]> = {
    'Sports & Outdoors': [
      'Perfect for gym workouts and outdoor activities',
      'Great for staying hydrated throughout the day',
      'Ideal for travel and commuting'
    ],
    'Electronics': [
      'Enhances your smart home experience',
      'Great for entertainment and productivity',
      'Perfect gift for tech enthusiasts'
    ],
    'Home & Kitchen': [
      'Makes cooking and meal prep easier',
      'Essential for home cooks and food lovers',
      'Great for organizing your kitchen'
    ],
    'Health & Wellness': [
      'Promotes relaxation and well-being',
      'Creates a calming atmosphere at home',
      'Perfect for self-care routines'
    ]
  }
  
  return useCases[category] || ['High-quality product for everyday use']
}
