import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { syncBatchFromTraceUrl } from '@/lib/hanoicheck-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const traceUrl = String(body.traceUrl || '').trim();
  if (!traceUrl) return NextResponse.json({ error: 'Cần URL trang truy xuất HanoiCheck.' }, { status: 400 });
  try {
    const outcome = await syncBatchFromTraceUrl(traceUrl);
    await prisma.auditLog.create({ data: { action: outcome.action === 'created' ? 'CREATE' : 'UPDATE', entity: 'BATCH', entityId: outcome.batchCode, summary: `${outcome.action === 'created' ? 'Nhập' : 'Cập nhật'} lô ${outcome.batchCode} từ HanoiCheck (dán URL)` } });
    return NextResponse.json(outcome, { status: outcome.action === 'created' ? 201 : 200 });
  } catch (error) {
    const cause = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
    const suffix = cause ? ` (mã lỗi mạng: ${cause})` : '';
    return NextResponse.json({ error: (error instanceof Error ? error.message : 'Không nhập được lô từ URL này.') + suffix }, { status: 422 });
  }
}
