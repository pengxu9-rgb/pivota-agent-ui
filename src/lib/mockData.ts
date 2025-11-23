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
      image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&h=500&fit=crop',
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
      image_url: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=500&h=500&fit=crop',
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
      image_url: 'https://images.unsplash.com/photo-1624461455743-c0ea2966ae0b?w=500&h=500&fit=crop',
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
      image_url: 'https://images.unsplash.com/photo-1589492477829-5e65395b66cc?w=500&h=500&fit=crop',
      category: 'Electronics',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'HEADPHONES_001',
      title: 'Wireless Bluetooth Headphones',
      description: 'Active noise cancelling, 30-hour battery life, comfortable over-ear design',
      price: 79.99,
      currency: 'USD',
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop',
      category: 'Electronics',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'POWERBANK_001',
      title: 'Portable Power Bank 20000mAh',
      description: 'Fast charging with USB-C and dual USB-A ports. LED power display',
      price: 35.99,
      currency: 'USD',
      image_url: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&h=500&fit=crop',
      category: 'Electronics',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    
    // Kitchen & Home
    {
      product_id: 'BLENDER_001',
      title: 'High-Speed Smoothie Blender',
      description: '1200W motor, 6 stainless steel blades, perfect for smoothies and soups',
      price: 89.99,
      currency: 'USD',
      image_url: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=500&h=500&fit=crop',
      category: 'Kitchen',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'COFFEMAKER_001',
      title: 'Programmable Coffee Maker',
      description: '12-cup capacity with auto-brew feature. Keeps coffee hot for 2 hours',
      price: 69.99,
      currency: 'USD',
      image_url: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=500&h=500&fit=crop',
      category: 'Kitchen',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    
    // Gifts & Lifestyle
    {
      product_id: 'CANDLE_001',
      title: 'Luxury Scented Candle Gift Set',
      description: 'Premium soy wax candles in elegant packaging. Perfect gift',
      price: 45.00,
      currency: 'USD',
      image_url: 'https://images.unsplash.com/photo-1602874801006-95e39d1e4943?w=500&h=500&fit=crop',
      category: 'Gifts',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
    {
      product_id: 'WATCH_001',
      title: 'Minimalist Analog Watch',
      description: 'Classic design with leather strap. Water resistant up to 50m',
      price: 129.99,
      currency: 'USD',
      image_url: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=500&h=500&fit=crop',
      category: 'Accessories',
      in_stock: true,
      merchant_id: 'merch_208139f7600dbf42'
    },
  ]
}

export type Product = typeof mockProducts['merch_208139f7600dbf42'][0]
