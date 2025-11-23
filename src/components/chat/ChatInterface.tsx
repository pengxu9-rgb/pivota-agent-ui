'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, ShoppingBag, Loader2 } from 'lucide-react'
import ProductCard from '@/components/product/ProductCard'
import { sendMessage } from '@/lib/api'

interface Product {
  product_id: string
  title: string
  description: string
  price: number
  currency: string
  image_url?: string
  category?: string
  in_stock: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  products?: Product[]
  timestamp?: Date
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: 'Hi! I\'m your Pivota shopping assistant. What are you looking for today?',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<null | HTMLDivElement>(null)

  // 快速搜索建议
  const quickSearches = [
    'Water bottle',
    'Bluetooth headphones',
    'Smart speaker',
    'Phone charger',
    'Laptop stand'
  ]

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    
    const userMessage: Message = { 
      role: 'user', 
      content: input,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    try {
      // 调用API搜索产品
      const products = await sendMessage(input)
      
      const assistantMessage: Message = { 
        role: 'assistant', 
        content: products.length > 0 
          ? `I found ${products.length} great option${products.length > 1 ? 's' : ''} for you!`
          : `I couldn't find products matching "${input}". Try searching for something else!`,
        products: products.length > 0 ? products : undefined,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error:', error)
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while searching. Please try again!',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
      {/* Chat Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg">
        <ShoppingBag size={24} />
        <div>
          <h2 className="font-semibold">Shopping Assistant</h2>
          <p className="text-sm opacity-90">Always here to help you shop smarter</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, i) => (
          <div key={i} className="animate-slide-up">
            <div
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-xs lg:max-w-2xl px-4 py-3 rounded-lg ${
                msg.role === 'user' 
                  ? 'bg-blue-500 text-white ml-4' 
                  : 'bg-white text-gray-800 shadow-md mr-4 border border-gray-200'
              }`}>
                <p className="text-sm">{msg.content}</p>
                {msg.timestamp && (
                  <p className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                  }`}>
                    {msg.timestamp.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                )}
              </div>
            </div>
            
            {/* 展示商品卡片 */}
            {msg.products && msg.products.length > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4">
                {msg.products.map((product) => (
                  <ProductCard
                    key={product.product_id}
                    product_id={product.product_id}
                    title={product.title}
                    price={product.price}
                    image={product.image_url || "/placeholder.svg"}
                    description={product.description}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-white text-gray-800 shadow-md px-4 py-3 rounded-lg border border-gray-200">
              <Loader2 className="animate-spin" size={20} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area */}
      <div className="border-t p-4 bg-white rounded-b-lg">
        {/* Quick search suggestions */}
        {messages.length === 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <p className="text-sm text-gray-500 w-full">Try searching for:</p>
            {quickSearches.map((search) => (
              <button
                key={search}
                onClick={() => setInput(search)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
              >
                {search}
              </button>
            ))}
          </div>
        )}
        
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask me anything about shopping..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Powered by Pivota AI • Your trusted shopping companion
        </p>
      </div>
    </div>
  )
}
