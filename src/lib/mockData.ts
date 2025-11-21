// Shared mock data for the UI
export const mockProducts = {
  'merch_208139f7600dbf42': [
    // Water Bottles
    {
      product_id: 'BOTTLE_001',
      title: 'Stainless Steel Water Bottle - 24oz',
      description: 'Double wall insulated bottle keeps drinks cold for 24 hours or hot for 12 hours',
      price: 24.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/61CGHv1V7AL._AC_SL1500_.jpg',
      category: 'Sports & Outdoors',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'BOTTLE_002',
      title: 'Collapsible Silicone Water Bottle - 20oz',
      description: 'BPA-free, foldable design saves space when empty. Perfect for travel',
      price: 15.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/71Y5X9mKr6L._AC_SL1500_.jpg',
      category: 'Sports & Outdoors',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'BOTTLE_003',
      title: 'Smart Water Bottle with LED Reminder',
      description: 'Track your hydration with app connectivity and glowing reminders',
      price: 39.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/61M4QXKlRWL._AC_SL1500_.jpg',
      category: 'Electronics',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    
    // Electronics
    {
      product_id: 'ECHO_DOT_5',
      title: 'Echo Dot (5th Gen) Smart Speaker with Alexa',
      description: 'Our best sounding Echo Dot yet - Enjoy improved audio experience',
      price: 49.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/518cRYanpbL._AC_SL1000_.jpg',
      category: 'Electronics',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'HEADPHONE_001',
      title: 'Wireless Bluetooth Headphones',
      description: 'Active noise cancelling, 30-hour battery life, comfortable over-ear design',
      price: 79.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/71loDx7fUxL._AC_SL1500_.jpg',
      category: 'Electronics',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'CHARGER_001',
      title: 'Portable Power Bank 20000mAh',
      description: 'Fast charging with USB-C and dual USB-A ports. LED display shows battery level',
      price: 35.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/71qzW4NPgvL._AC_SL1500_.jpg',
      category: 'Electronics',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    
    // Kitchen & Cooking
    {
      product_id: 'KITCHEN_001',
      title: 'Professional Chef Knife Set (3 pieces)',
      description: 'High carbon stainless steel with ergonomic handles. Includes chef, paring, and utility knives',
      price: 89.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/71cVlMnPB4L._AC_SL1500_.jpg',
      category: 'Home & Kitchen',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'KITCHEN_002',
      title: 'Digital Kitchen Scale',
      description: 'Precise measurements up to 11lbs/5kg. Tare function and multiple units',
      price: 19.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/71UnpOJJWyL._AC_SL1500_.jpg',
      category: 'Home & Kitchen',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'KITCHEN_003',
      title: 'Silicone Cooking Utensils Set (12 pieces)',
      description: 'Heat resistant up to 446°F. Non-stick and dishwasher safe',
      price: 29.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/81Qx1MqVKQL._AC_SL1500_.jpg',
      category: 'Home & Kitchen',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    
    // Gifts
    {
      product_id: 'GIFT_001',
      title: 'Aromatherapy Essential Oil Diffuser',
      description: '300ml capacity with 7 LED colors. Auto shut-off and timer settings',
      price: 25.99,
      currency: 'USD',
      image_url: 'https://m.media-amazon.com/images/I/71xZ3LEJYRL._AC_SL1500_.jpg',
      category: 'Health & Wellness',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    }
  ]
}

export type Product = typeof mockProducts['merch_208139f7600dbf42'][0]

export function getProductById(productId: string): Product | undefined {
  return mockProducts['merch_208139f7600dbf42'].find(p => p.product_id === productId)
}

export function getProductsByCategory(category: string): Product[] {
  return mockProducts['merch_208139f7600dbf42'].filter(p => p.category === category)
}
