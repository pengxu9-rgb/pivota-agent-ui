import { Metadata } from 'next'
import ProductCard from '@/components/product/ProductCard'
import { mockProducts } from '@/lib/mockData'

export const metadata: Metadata = {
  title: 'All Products - Pivota Shopping AI',
  description: 'Browse our collection of water bottles, electronics, kitchen items, and more. AI-powered shopping made simple.',
  keywords: 'water bottles, electronics, kitchen gadgets, smart home, shopping, AI assistant',
  openGraph: {
    title: 'Shop All Products - Pivota Shopping AI',
    description: 'Discover amazing products with AI-powered recommendations',
    type: 'website',
    url: 'https://agent.pivota.cc/products',
  },
}

export default function ProductsPage() {
  // In production, this would fetch from API
  const products = mockProducts.merch_208139f7600dbf42 || []

  // Group products by category
  const categories = products.reduce((acc, product) => {
    const category = product.category || 'Other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(product)
    return acc
  }, {} as Record<string, typeof products>)

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">All Products</h1>
            </div>
            <nav className="flex gap-4">
              <a href="/" className="text-gray-600 hover:text-gray-900">Chat Assistant</a>
              <a href="/products" className="text-gray-900 font-medium">Products</a>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-4">Browse Our Collection</h2>
          <p className="text-gray-600">
            Discover quality products across multiple categories. All items available for immediate purchase through our AI shopping assistant.
          </p>
        </div>

        {Object.entries(categories).map(([category, categoryProducts]) => (
          <section key={category} className="mb-12">
            <h3 className="text-2xl font-semibold text-gray-800 mb-6">{category}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {categoryProducts.map((product) => (
                <div key={product.product_id}>
                  <ProductCard
                    id={product.product_id}
                    title={product.title}
                    price={product.price}
                    image={product.image_url}
                    description={product.description}
                    rating={4.5}
                  />
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
                        "offers": {
                          "@type": "Offer",
                          "price": product.price,
                          "priceCurrency": "USD",
                          "availability": product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                          "seller": {
                            "@type": "Organization",
                            "name": "Pivota Shopping AI"
                          }
                        }
                      })
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
