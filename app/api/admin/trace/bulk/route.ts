import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { setBatchPublic, setEventPublic } from '@/lib/trace-publish';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const type = String(body.type ?? '');
  const isPublic = body.isPublic;
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map((raw: unknown) => Number(raw)).filter((n: number) => Number.isSafeInteger(n) && n > 0)
    : [];
  if ((type !== 'batch' && type !== 'event') || typeof isPublic !== 'boolean' || !ids.length)
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: 'Chỉ xử lý tối đa 200 mục mỗi lần.' }, { status: 400 });

  const succeeded: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    const result = type === 'batch' ? await setBatchPublic(id, isPublic) : await setEventPublic(id, isPublic);
    if (result.ok) succeeded.push(id); else failed.push({ id, error: result.error });
  }
  return NextResponse.json({ succeeded, failed });
}
