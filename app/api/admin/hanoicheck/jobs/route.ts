import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { enqueueSyncJob, type SyncJobInput } from '@/lib/hanoicheck-jobs';
import { prisma } from '@/lib/prisma';
import { rejectUntrustedMutation } from '@/lib/security';
import type { Prisma } from '../../../../../generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'no-store' };
const statuses = new Set(['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']);

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function jobSummary(kind: string, payload: string) {
  try {
    const input = JSON.parse(payload) as Partial<SyncJobInput>;
    if (kind === 'URLS' && input.kind === 'URLS' && Array.isArray(input.urls)) {
      return { urlCount: input.urls.length };
    }
    if (kind === 'ORDERS' && input.kind === 'ORDERS') {
      return { dateFrom: input.dateFrom, dateTo: input.dateTo };
    }
  } catch {
    // A malformed historical row remains visible without exposing or executing
    // its raw payload.
  }
  return null;
}

function safeJson(value: string) {
  try { return JSON.parse(value) as unknown; }
  catch { return null; }
}

function resultSummary(value: string | null) {
  if (!value) return null;
  const parsed = safeJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const result = parsed as Record<string, unknown>;
  const number = (key: string) => typeof result[key] === 'number' ? result[key] : 0;
  return {
    processed: number('processed'),
    created: number('created'),
    updated: number('updated'),
    pending: number('pending'),
    unchanged: number('unchanged'),
    skipped: Array.isArray(result.skipped) ? result.skipped.length : 0,
  };
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedStatus = (searchParams.get('status') || 'all').toUpperCase();
  if (requestedStatus !== 'ALL' && !statuses.has(requestedStatus)) {
    return NextResponse.json({ error: 'Trạng thái lượt đồng bộ không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }
  const page = positiveInteger(searchParams.get('page'), 1, 1_000_000);
  const pageSize = positiveInteger(searchParams.get('pageSize'), 30, 100);
  const where: Prisma.HanoiCheckSyncJobWhereInput = requestedStatus === 'ALL' ? {} : { status: requestedStatus };

  const [total, rows] = await Promise.all([
    prisma.hanoiCheckSyncJob.count({ where }),
    prisma.hanoiCheckSyncJob.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        kind: true,
        status: true,
        result: true,
        error: true,
        attempts: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        payload: true,
      },
    }),
  ]);

  const items = rows.map(({ payload, result, ...row }) => ({
    ...row,
    input: jobSummary(row.kind, payload),
    result: resultSummary(result),
  }));
  return NextResponse.json({ items, total, page, pageSize }, { headers: privateHeaders });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Dữ liệu lượt đồng bộ không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }

  let input: SyncJobInput;
  if (body.kind === 'URLS') {
    if (!Array.isArray(body.urls) || body.urls.some((url: unknown) => typeof url !== 'string')) {
      return NextResponse.json({ error: 'Danh sách URL truy xuất không hợp lệ.' }, { status: 400, headers: privateHeaders });
    }
    input = { kind: 'URLS', urls: body.urls };
  } else if (body.kind === 'ORDERS') {
    if (typeof body.dateFrom !== 'string' || typeof body.dateTo !== 'string') {
      return NextResponse.json({ error: 'Khoảng ngày đồng bộ không hợp lệ.' }, { status: 400, headers: privateHeaders });
    }
    input = { kind: 'ORDERS', dateFrom: body.dateFrom, dateTo: body.dateTo };
  } else {
    return NextResponse.json({ error: 'Loại đồng bộ không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }

  try {
    const job = await enqueueSyncJob(input);
    return NextResponse.json(job, { status: 202, headers: { ...privateHeaders, Location: `/api/admin/hanoicheck/jobs/${job.id}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không tạo được lượt đồng bộ.';
    const status = message.includes('nhiều lượt đồng bộ') ? 429 : 400;
    return NextResponse.json({ error: message }, { status, headers: privateHeaders });
  }
}
