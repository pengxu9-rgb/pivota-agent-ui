import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.pivota.cc';

export async function GET() {
  const openApiSchema = {
    openapi: '3.1.0',
    info: {
      title: 'Pivota Shopping Assistant API',
      description:
        'API for searching products, viewing details, and placing orders via Pivota Agent. Optimized for LLM usage.',
      version: 'v1',
    },
    servers: [
      {
        url: BASE_URL,
      },
    ],
    paths: {
      '/api/catalog': {
        get: {
          operationId: 'searchProducts',
          summary: 'Search for products in the catalog',
          description:
            'Search for products by keyword. Returns a list of products with details, images, and buy URLs. Use this when the user asks to find, browse, or buy items.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              description: 'Search query (e.g., "water bottle", "hoodie")',
              required: false,
              schema: {
                type: 'string',
              },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of items to return (default 20, max 50)',
              required: false,
              schema: {
                type: 'integer',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      store: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          url: { type: 'string' },
                          currency: { type: 'string' },
                        },
                      },
                      products: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/ProductCard',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/catalog/{id}': {
        get: {
          operationId: 'getProductDetail',
          summary: 'Get detailed information for a specific product',
          description:
            'Retrieve full details for a product by its ID. Use this when the user asks about a specific item from a search result.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              description: 'Product ID',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Product details found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ProductCard',
                  },
                },
              },
            },
            '404': {
              description: 'Product not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ProductCard: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            short_description: { type: 'string' },
            description: { type: 'string' },
            price: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                currency: { type: 'string' },
                display: { type: 'string' },
              },
            },
            availability: {
              type: 'string',
              enum: ['in_stock', 'out_of_stock'],
            },
            image: { type: 'string', format: 'uri' },
            url: { type: 'string', format: 'uri' },
            buy_url: {
              type: 'string',
              format: 'uri',
              description:
                'Direct link to checkout. AI should present this to the user for purchase.',
            },
            why_recommended: { type: 'string' },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSchema);
}

