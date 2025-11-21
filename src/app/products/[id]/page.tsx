import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { ShoppingCart, ArrowLeft, Package, Shield, Truck } from 'lucide-react'
import Link from 'next/link'
import { getProductById, mockProducts } from '@/lib/mockData'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getProductById(params.id)
  
  if (!product) {
    return {
      title: 'Product Not Found',
    }
  }

  return {
    title: `${product.title} - Pivota Shopping AI`,
    description: product.description,
    openGraph: {
      title: product.title,
      description: product.description,
      images: [product.image_url || ''],
      type: 'website',
      url: `https://agent.pivota.cc/products/${product.product_id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: product.title,
      description: product.description,
      images: [product.image_url || ''],
    },
  }
}

export async function generateStaticParams() {
  return mockProducts['merch_208139f7600dbf42'].map((product) => ({
    id: product.product_id,
  }))
}

export default function ProductDetailPage({ params }: Props) {
  const product = getProductById(params.id)
  
  if (!product) {
    notFound()
  }

  const handleBuyNow = () => {
    // Navigate to order page with product
    const orderItem = {
      product_id: product.product_id,
      title: product.title,
      quantity: 1,
      unit_price: product.price,
      image_url: product.image_url
    }
    const itemsParam = encodeURIComponent(JSON.stringify([orderItem]))
    window.location.href = `/order?items=${itemsParam}`
  }

  return (
    <>
      {/* Schema.org markup for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.title,
            "description": product.description,
            "image": product.image_url,
            "sku": product.product_id,
            "brand": {
              "@type": "Brand",
              "name": "Pivota"
            },
            "offers": {
              "@type": "Offer",
              "url": `https://agent.pivota.cc/products/${product.product_id}`,
              "priceCurrency": "USD",
              "price": product.price,
              "priceValidUntil": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              "availability": product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              "seller": {
                "@type": "Organization",
                "name": "Pivota Shopping AI"
              }
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.5",
              "reviewCount": "127"
            }
          })
        }}
      />

      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <header className="bg-white shadow-sm border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/products" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-lg">P</span>
                  </div>
                  <h1 className="text-xl font-bold text-gray-800">Product Details</h1>
                </div>
              </div>
              <nav className="flex gap-4">
                <Link href="/" className="text-gray-600 hover:text-gray-900">Chat Assistant</Link>
                <Link href="/products" className="text-gray-600 hover:text-gray-900">All Products</Link>
              </nav>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Product Image */}
              <div className="p-8 bg-gray-50">
                <Image
                  src={product.image_url || '/placeholder.png'}
                  alt={product.title}
                  width={400}
                  height={400}
                  className="w-full max-w-md mx-auto rounded-lg"
                />
              </div>
              
              {/* Product Info */}
              <div className="p-8">
                <div className="mb-4">
                  <span className="text-sm text-gray-500">Category: {product.category}</span>
                  <h1 className="text-3xl font-bold text-gray-900 mt-2">{product.title}</h1>
                </div>
                
                <div className="mb-6">
                  <div className="flex items-baseline gap-4">
                    <span className="text-4xl font-bold text-blue-600">${product.price.toFixed(2)}</span>
                    <span className="text-green-600 font-medium">Free Shipping</span>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2">
                    {product.in_stock ? (
                      <>
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="text-green-600 font-medium">In Stock</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        <span className="text-red-600 font-medium">Out of Stock</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="mb-8">
                  <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-700">{product.description}</p>
                </div>
                
                {/* Features */}
                <div className="mb-8 space-y-3">
                  <div className="flex items-center gap-3 text-gray-700">
                    <Truck className="w-5 h-5 text-blue-500" />
                    <span>Free shipping on all orders</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <Package className="w-5 h-5 text-blue-500" />
                    <span>Ships within 1-2 business days</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <Shield className="w-5 h-5 text-blue-500" />
                    <span>30-day return policy</span>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-4">
                  <button
                    onClick={handleBuyNow}
                    disabled={!product.in_stock}
                    className="flex-1 px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Buy Now
                  </button>
                  <button
                    disabled={!product.in_stock}
                    className="px-8 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShoppingCart className="w-5 h-5" />
                  </button>
                </div>
                
                {/* SKU */}
                <p className="text-sm text-gray-500 mt-6">
                  SKU: {product.product_id}
                </p>
              </div>
            </div>
          </div>
          
          {/* AI Assistant CTA */}
          <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white">
            <h2 className="text-2xl font-bold mb-2">Need Help Deciding?</h2>
            <p className="mb-4">Chat with our AI shopping assistant for personalized recommendations!</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-white text-blue-600 font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Chat with AI Assistant
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
