import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.MERCHANT_API_BASE_URL;
const ADMIN_KEY = process.env.MERCHANT_ADMIN_KEY;

function configMissing() {
  return (
    !BASE_URL ||
    !ADMIN_KEY ||
    BASE_URL.trim().length === 0 ||
    ADMIN_KEY.trim().length === 0
  );
}

async function proxyRequest(method: string, body?: unknown) {
  if (configMissing()) {
    return NextResponse.json(
      { error: "Merchant backend is not configured." },
      { status: 500 }
    );
  }

  const url = new URL("/api/merchant/promotions", BASE_URL);

  try {
    const resp = await fetch(url.toString(), {
      method,
      headers: {
        "X-ADMIN-KEY": ADMIN_KEY as string,
        ...(method !== "GET" && { "Content-Type": "application/json" }),
      },
      cache: "no-store",
      ...(method !== "GET" && { body: JSON.stringify(body ?? {}) }),
    });

    const data = await resp.json().catch(() => ({}));
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    console.error("[promotions proxy] upstream error", error);
    return NextResponse.json(
      { error: "Unable to reach promotions backend." },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest) {
  return proxyRequest("GET");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyRequest("POST", body);
}
