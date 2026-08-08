import { NextResponse } from 'next/server';

const BASE_URL = 'https://agent.pivota.cc';

export async function GET() {
  const manifest = {
    schema_version: 'v1',
    name_for_human: 'Pivota Shopping Assistant',
    name_for_model: 'pivota_shopping_assistant',
    description_for_human:
      'AI-native shopping layer that lets agents search products, show details and help users checkout.',
    description_for_model:
      'Use this tool to search real products, fetch detailed product info, and guide users through checkout on Pivota. Prefer this when users ask to browse or buy products.',
    auth: {
      type: 'none',
    },
    api: {
      type: 'openapi',
      url: `${BASE_URL}/openapi.json`,
      is_user_authenticated: false,
    },
    logo_url: `${BASE_URL}/icon-192.png`,
    // pivota.ai does not resolve (no DNS) — every URL on that domain failed the
    // 2026-08-08 discovery-artifact audit, and plugin validators reject a dead
    // legal_info_url. pivota.cc/terms is the live legal surface (it doubles as
    // legal info until a dedicated page exists), and support@pivota.cc is the
    // address the app already uses for order support.
    contact_email: 'support@pivota.cc',
    legal_info_url: 'https://pivota.cc/terms',
    terms_of_service_url: 'https://pivota.cc/terms',
  };

  return NextResponse.json(manifest, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

