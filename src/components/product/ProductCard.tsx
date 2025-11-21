'use client'

import { ShoppingCart, Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface ProductCardProps {
  id: string
  title: string
  price: number
  image?: string
  description?: string
  rating?: number
  onBuy?: () => void
  onAddToCart?: () => void
}

export default function ProductCard({ 
  id,
  title, 
  price, 
  image = '/placeholder.png', 
  description,
  rating = 4.5,
  onBuy,
  onAddToCart
}: ProductCardProps) {
  const router = useRouter()
  
  const handleBuyNow = () => {
    if (onBuy) {
      onBuy()
    } else {
      // Navigate to order page with product info
      const orderItem = {
        product_id: id,
        title,
        quantity: 1,
        unit_price: price,
        image_url: image
      }
      const itemsParam = encodeURIComponent(JSON.stringify([orderItem]))
      router.push(`/order?items=${itemsParam}`)
    }
  }
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      <div className="relative">
        <Image 
          src={image} 
          alt={title}
          width={300}
          height={200} 
          className="w-full h-48 object-cover"
        />
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1">
          <Star className="w-4 h-4 text-yellow-500 fill-current" />
          <span className="text-sm font-medium">{rating}</span>
        </div>
      </div>
      
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-2 line-clamp-2">{title}</h3>
        {description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-3">{description}</p>
        )}
        
        <div className="flex justify-between items-center mb-4">
          <span className="text-2xl font-bold text-blue-600">
            ${price.toFixed(2)}
          </span>
          <span className="text-sm text-gray-500">Free shipping</span>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleBuyNow}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            Buy Now
          </button>
          <button
            onClick={onAddToCart}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="Add to cart"
          >
            <ShoppingCart size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
