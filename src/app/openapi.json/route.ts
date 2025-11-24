import { NextResponse } from 'next/server';

const REMOTE_OPENAPI_URL =
  'https://raw.githubusercontent.com/pengxu9-rgb/PIVOTA-Agent/main/chatgpt-gpt-openapi-schema.json';

export async function GET() {
  try {
    const res = await fetch(REMOTE_OPENAPI_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch OpenAPI: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    return NextResponse.json(json, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('OpenAPI proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to load OpenAPI document' },
      { status: 500 },
    );
  }
}

