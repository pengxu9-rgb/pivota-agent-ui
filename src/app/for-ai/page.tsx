import { Metadata } from 'next'
import Link from 'next/link'
import { Code, Bot, Zap, Shield } from 'lucide-react'

export const metadata: Metadata = {
  title: 'AI Integration Guide - Pivota Shopping AI',
  description: 'Learn how AI agents can integrate with Pivota to provide shopping capabilities to users. RESTful API, OpenAPI schema, and comprehensive documentation.',
  keywords: 'AI integration, shopping API, LLM tools, AI agents, function calling, OpenAPI',
}

export default function ForAIPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">For AI Agents</h1>
            </div>
            <nav className="flex gap-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">Home</Link>
              <Link href="/products" className="text-gray-600 hover:text-gray-900">Products</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <Bot className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            How AI Agents Can Use Pivota
          </h2>
          <p className="text-xl text-gray-600">
            Integrate shopping capabilities into your AI agent with our RESTful API
          </p>
        </div>

        {/* Key Features */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <Zap className="w-8 h-8 text-blue-600 mb-3" />
            <h3 className="text-xl font-semibold mb-2">Easy Integration</h3>
            <p className="text-gray-600">
              Simple RESTful API with comprehensive OpenAPI 3.1 schema. Function calling ready for ChatGPT, Claude, and Gemini.
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-md">
            <Shield className="w-8 h-8 text-blue-600 mb-3" />
            <h3 className="text-xl font-semibold mb-2">Secure & Reliable</h3>
            <p className="text-gray-600">
              Production-ready with HTTPS, proper error handling, and comprehensive logging.
            </p>
          </div>
        </div>

        {/* API Endpoints */}
        <div className="bg-white rounded-lg p-8 shadow-lg mb-8">
          <h3 className="text-2xl font-bold mb-6">API Endpoints</h3>
          
          <div className="space-y-6">
            <div>
              <h4 className="font-mono text-lg mb-2 text-blue-600">GET /api/catalog</h4>
              <p className="text-gray-600 mb-2">Get all products in structured JSON format</p>
              <code className="block bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                curl https://agent.pivota.cc/api/catalog
              </code>
            </div>
            
            <div>
              <h4 className="font-mono text-lg mb-2 text-blue-600">GET /api/catalog/[id]</h4>
              <p className="text-gray-600 mb-2">Get detailed product information</p>
              <code className="block bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                curl https://agent.pivota.cc/api/catalog/BOTTLE_001
              </code>
            </div>
            
            <div>
              <h4 className="font-mono text-lg mb-2 text-blue-600">POST /agent/shop/v1/invoke</h4>
              <p className="text-gray-600 mb-2">Main shopping operations endpoint</p>
              <code className="block bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                {`curl -X POST https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke \\
  -H "Content-Type: application/json" \\
  -d '{"operation":"find_products","payload":{"search":{"query":"water bottle"}}}'`}
              </code>
            </div>
          </div>
        </div>

        {/* Operations */}
        <div className="bg-white rounded-lg p-8 shadow-lg mb-8">
          <h3 className="text-2xl font-bold mb-6">Supported Operations</h3>
          
          <ul className="space-y-4">
            <li className="flex gap-3">
              <span className="font-mono text-blue-600 font-semibold">find_products</span>
              <span className="text-gray-600">Search for products by query, category, or price range</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-blue-600 font-semibold">get_product_detail</span>
              <span className="text-gray-600">Get detailed information about a specific product</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-blue-600 font-semibold">create_order</span>
              <span className="text-gray-600">Create a shopping order with shipping information</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-blue-600 font-semibold">submit_payment</span>
              <span className="text-gray-600">Process payment for an order</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-blue-600 font-semibold">get_order_status</span>
              <span className="text-gray-600">Track order status and shipping updates</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-blue-600 font-semibold">request_after_sales</span>
              <span className="text-gray-600">Handle returns and refunds</span>
            </li>
          </ul>
        </div>

        {/* Resources */}
        <div className="bg-white rounded-lg p-8 shadow-lg mb-8">
          <h3 className="text-2xl font-bold mb-6">Resources</h3>
          
          <div className="space-y-3">
            <a 
              href="https://github.com/pengxu9-rgb/PIVOTA-Agent/blob/main/chatgpt-gpt-openapi-schema.json"
              className="flex items-center gap-2 text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Code className="w-4 h-4" />
              OpenAPI 3.1 Schema
            </a>
            <a 
              href="https://github.com/pengxu9-rgb/PIVOTA-Agent"
              className="flex items-center gap-2 text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Code className="w-4 h-4" />
              GitHub Repository
            </a>
            <Link 
              href="/api/catalog"
              className="flex items-center gap-2 text-blue-600 hover:underline"
            >
              <Code className="w-4 h-4" />
              Product Catalog API
            </Link>
            <Link 
              href="/sitemap.xml"
              className="flex items-center gap-2 text-blue-600 hover:underline"
            >
              <Code className="w-4 h-4" />
              Sitemap
            </Link>
          </div>
        </div>

        {/* Example AI Agent */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-8 text-white">
          <h3 className="text-2xl font-bold mb-4">Try Our ChatGPT Shopping Assistant</h3>
          <p className="mb-6">
            See how AI-powered shopping works in action. Ask our assistant to find products, compare options, and complete purchases.
          </p>
          <a
            href="https://chatgpt.com/g/g-69201604c1308191b2fc5f23d57e9874-pivota-shopping-assistant"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-white text-blue-600 font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Chat with Pivota Assistant
          </a>
        </div>

        {/* Contact */}
        <div className="text-center mt-12 text-gray-600">
          <p>Questions or want to integrate Pivota into your AI agent?</p>
          <p className="mt-2">
            <a href="https://github.com/pengxu9-rgb/PIVOTA-Agent/issues" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              Open an issue on GitHub
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
