import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { enqueueSyncJob } from '@/lib/hanoicheck-jobs';
import { vietnamToday } from '@/lib/hanoicheck-normalize';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const today = vietnamToday();
  const dateFrom = typeof body.dateFrom === 'string' ? body.dateFrom : today;
  const dateTo = typeof body.dateTo === 'string' ? body.dateTo : dateFrom;
  try {
    const job = await enqueueSyncJob({ kind: 'ORDERS', dateFrom, dateTo });
    await prisma.auditLog.create({ data: { action: 'CREATE', entity: 'HANOICHECK_JOB', entityId: job.id, summary: `Tạo lượt đọc đơn hàng HanoiCheck ${dateFrom}→${dateTo}.` } });
    return NextResponse.json(job, { status: 202, headers: { 'Cache-Control': 'no-store', Location: `/api/admin/hanoicheck/jobs/${job.id}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không tạo được lượt đồng bộ HanoiCheck.';
    return NextResponse.json({ error: message }, { status: message.includes('nhiều lượt') ? 429 : 400 });
  }
}
