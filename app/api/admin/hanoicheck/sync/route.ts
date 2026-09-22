import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { syncBatchesFromOrders } from '@/lib/hanoicheck-sync';
import { HanoiCheckApiError } from '@/lib/hanoicheck-errors';

export const dynamic = 'force-dynamic';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = typeof body.dateFrom === 'string' && isoDate.test(body.dateFrom) ? body.dateFrom : today;
  const dateTo = typeof body.dateTo === 'string' && isoDate.test(body.dateTo) ? body.dateTo : dateFrom;
  if (dateTo < dateFrom) return NextResponse.json({ error: 'Ngày kết thúc phải sau ngày bắt đầu.' }, { status: 400 });
  try {
    const result = await syncBatchesFromOrders(dateFrom, dateTo);
    const status = result.skipped.length && !result.created && !result.updated ? 'FAILED' : result.skipped.length ? 'PARTIAL' : 'OK';
    await prisma.hanoiCheckIntegrationSettings.upsert({
      where: { id: 1 },
      create: { id: 1, lastSyncedAt: new Date(), lastSyncStatus: status, lastSyncCount: result.created + result.updated },
      update: { lastSyncedAt: new Date(), lastSyncStatus: status, lastSyncCount: result.created + result.updated },
    });
    await prisma.auditLog.create({ data: { action: 'SYNC', entity: 'HANOICHECK_BATCHES', summary: `Đồng bộ HanoiCheck ${dateFrom}→${dateTo}: ${result.processed} lô đọc, ${result.created} mới, ${result.updated} cập nhật, ${result.skipped.length} bỏ qua` } });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof HanoiCheckApiError) return NextResponse.json({ error: error.message }, { status: error.status === 401 || error.status === 503 ? error.status : 502 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không đồng bộ được từ HanoiCheck.' }, { status: 502 });
  }
}
