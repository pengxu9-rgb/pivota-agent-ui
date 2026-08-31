import { NextResponse } from 'next/server';
import { SITEMAP_SEED_PRODUCT_IDS } from '../sitemap-seeds';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.pivota.cc';

export async function GET() {
  const openApiSchema = {
    openapi: '3.1.0',
    info: {
      title: 'Pivota Shopping Assistant API',
      description:
        'API for product discovery, candidate resolution, and shopping handoff via the Pivota Agent gateway.',
      version: 'v1',
    },
    servers: [
      {
        url: BASE_URL,
      },
    ],
    paths: {
      '/api/gateway': {
        post: {
          operationId: 'invokeShoppingGateway',
          summary: 'Invoke the shopping gateway',
          description:
            'Primary machine-facing entrypoint for product search and candidate resolution. Use find_products_multi for discovery and resolve_product_candidates when you already have a product id.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/FindProductsMultiRequest' },
                    { $ref: '#/components/schemas/ResolveProductCandidatesRequest' },
                  ],
                },
                examples: {
                  search: {
                    summary: 'Beauty product discovery',
                    value: {
                      operation: 'find_products_multi',
                      payload: {
                        search: {
                          query: 'best sunscreen for oily skin',
                          limit: 5,
                          search_all_merchants: true,
                          catalog_entity_mode: 'canonical_sig',
                          catalog_surface: 'agent_api',
                          commerce_surface: 'agent_api',
                          allow_external_seed: false,
                          allow_stale_cache: false,
                        },
                      },
                      metadata: {
                        source: 'aurora-bff',
                        ui_source: 'shopping-agent-ui',
                      },
                    },
                  },
                  resolve: {
                    summary: 'Resolve merchant candidates for a known product',
                    // The example id is a sig_* public id — the namespace
                    // find_products_multi emits and PDP URLs carry. The prior
                    // example ('9886499864904', a platform product id pinned to
                    // no live product) resolved to a hollow zero-offer success
                    // for anyone who copy-pasted it. include_offers/limit live
                    // under `options` (the server reads options.include_offers;
                    // the top-level form was silently ignored).
                    value: {
                      operation: 'resolve_product_candidates',
                      payload: {
                        product_ref: {
                          // First maintained sitemap seed — a curated, prod-verified id kept
                          // live by the seed list's own upkeep, instead of a one-off
                          // literal that can be suppressed/tombstoned silently.
                          product_id: SITEMAP_SEED_PRODUCT_IDS[0],
                        },
                        options: {
                          include_offers: true,
                          limit: 5,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Gateway response',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/GatewayResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/products/{id}': {
        get: {
          operationId: 'openProductPage',
          summary: 'Open the product detail page',
          description:
            'Human-facing PDP for reviewing a product, variant options, and checkout handoff after discovery.',
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
            {
              name: 'merchant_id',
              in: 'query',
              description: 'Optional merchant scope for cross-merchant products',
              required: false,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Product detail page',
            },
          },
        },
      },
    },
    components: {
      schemas: {
        FindProductsMultiRequest: {
          type: 'object',
          required: ['operation', 'payload'],
          properties: {
            operation: {
              type: 'string',
              const: 'find_products_multi',
            },
            payload: {
              type: 'object',
              required: ['search'],
              properties: {
                search: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: { type: 'string' },
                    limit: { type: 'integer' },
                    page: { type: 'integer' },
                    merchant_id: { type: 'string' },
                    search_all_merchants: { type: 'boolean' },
                    allow_external_seed: { type: 'boolean' },
                    catalog_entity_mode: {
                      type: 'string',
                      enum: ['canonical_sig'],
                      description:
                        'Returns product-catalog sig entities. Internal and external supply is represented in offers.',
                    },
                    allow_stale_cache: { type: 'boolean' },
                    external_seed_strategy: { type: 'string' },
                    catalog_surface: { type: 'string' },
                  },
                },
              },
            },
            metadata: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
        ResolveProductCandidatesRequest: {
          type: 'object',
          required: ['operation', 'payload'],
          properties: {
            operation: {
              type: 'string',
              const: 'resolve_product_candidates',
            },
            payload: {
              type: 'object',
              required: ['product_ref'],
              properties: {
                product_ref: {
                  type: 'object',
                  properties: {
                    product_id: {
                      type: 'string',
                      description:
                        'Preferred: the sig_* public id emitted by find_products_multi and ' +
                        'carried in PDP URLs (agent.pivota.cc/products/sig_*). Merchant-source ' +
                        'product ids also work when merchant_id is supplied.',
                    },
                    merchant_id: { type: 'string' },
                  },
                },
                options: {
                  type: 'object',
                  description:
                    'include_offers and limit are read from here; the legacy top-level ' +
                    'payload.include_offers was silently ignored by the server.',
                  properties: {
                    include_offers: { type: 'boolean', default: true },
                    limit: { type: 'integer', default: 10, maximum: 50 },
                  },
                },
                context: {
                  type: 'object',
                  properties: {
                    country: { type: 'string', description: 'ISO country code, e.g. US' },
                    postal_code: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        ProductCard: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            merchant_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            currency: { type: 'string' },
            image_url: { type: 'string', format: 'uri' },
            variant_id: { type: 'string' },
            platform: { type: 'string' },
            external_redirect_url: { type: 'string', format: 'uri' },
          },
        },
        GatewayResponse: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            success: { type: 'boolean' },
            products: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/ProductCard',
              },
            },
            total: { type: 'integer' },
            page: { type: 'integer' },
            page_size: { type: 'integer' },
            reply: { type: 'string' },
            metadata: {
              type: 'object',
              additionalProperties: true,
            },
            clarification: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSchema);
}
