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

async function proxyRequest(method: string, id: string, body?: unknown) {
  if (configMissing()) {
    return NextResponse.json(
      { error: "Merchant backend is not configured." },
      { status: 500 }
    );
  }

  const url = new URL(`/api/merchant/promotions/${id}`, BASE_URL);

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
    console.error("[promotion proxy] upstream error", error);
    return NextResponse.json(
      { error: "Unable to reach promotions backend." },
      { status: 500 }
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing promotion id." }, { status: 400 });
  }
  return proxyRequest("GET", id);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing promotion id." }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  return proxyRequest("PATCH", id, body);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing promotion id." }, { status: 400 });
  }
  return proxyRequest("DELETE", id);
}
