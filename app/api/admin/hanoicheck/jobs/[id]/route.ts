import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { cancelSyncJob } from '@/lib/hanoicheck-jobs';
import { prisma } from '@/lib/prisma';
import { rejectUntrustedMutation } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'no-store' };

function validJobId(value: string) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function safeJson(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; }
  catch { return null; }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!validJobId(id)) return NextResponse.json({ error: 'ID lượt đồng bộ không hợp lệ.' }, { status: 400, headers: privateHeaders });

  const job = await prisma.hanoiCheckSyncJob.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      payload: true,
      status: true,
      result: true,
      error: true,
      attempts: true,
      leaseExpiresAt: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      updatedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: 'Không tìm thấy lượt đồng bộ.' }, { status: 404, headers: privateHeaders });
  const { payload, result, ...safe } = job;
  return NextResponse.json({ ...safe, input: safeJson(payload), result: safeJson(result) }, { headers: privateHeaders });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const { id } = await params;
  if (!validJobId(id)) return NextResponse.json({ error: 'ID lượt đồng bộ không hợp lệ.' }, { status: 400, headers: privateHeaders });

  const cancelled = await cancelSyncJob(id);
  if (cancelled.outcome === 'missing') {
    return NextResponse.json({ error: 'Không tìm thấy lượt đồng bộ.' }, { status: 404, headers: privateHeaders });
  }
  if (cancelled.outcome === 'finished') {
    return NextResponse.json({ error: `Lượt đồng bộ đã kết thúc với trạng thái ${cancelled.status}.` }, { status: 409, headers: privateHeaders });
  }
  if (cancelled.outcome === 'race' && cancelled.status !== 'CANCELLED') {
    return NextResponse.json({ error: 'Trạng thái lượt đồng bộ vừa thay đổi; hãy tải lại.' }, { status: 409, headers: privateHeaders });
  }
  return NextResponse.json({ ok: true, status: 'CANCELLED' }, { headers: privateHeaders });
}
