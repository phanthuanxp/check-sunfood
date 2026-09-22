import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { listOrders } from '@/lib/hanoicheck';
import { HanoiCheckApiError } from '@/lib/hanoicheck-errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  try {
    const result = await listOrders({ page: 1, per_page: 1 });
    return NextResponse.json({ ok: true, total: result.pagination?.total ?? result.data.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof HanoiCheckApiError) return NextResponse.json({ error: error.message }, { status: error.status === 401 || error.status === 503 ? error.status : 502 });
    return NextResponse.json({ error: 'Không kiểm tra được kết nối HanoiCheck.' }, { status: 502 });
  }
}
