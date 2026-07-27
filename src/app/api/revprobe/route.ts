// TEMPORARY REVIEW PROBE — not for merge. Lets a reviewer drive revalidateTag /
// revalidatePath(path, type) against a real build to observe x-nextjs-cache.
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { tag?: string; path?: string; type?: string };
  if (typeof body.tag === 'string') {
    revalidateTag(body.tag);
    return NextResponse.json({ did: 'revalidateTag', tag: body.tag });
  }
  if (typeof body.path === 'string') {
    if (typeof body.type === 'string') {
      revalidatePath(body.path, body.type as 'page' | 'layout');
      return NextResponse.json({ did: 'revalidatePath', path: body.path, type: body.type });
    }
    revalidatePath(body.path);
    return NextResponse.json({ did: 'revalidatePath', path: body.path });
  }
  return NextResponse.json({ error: 'nothing' }, { status: 400 });
}
