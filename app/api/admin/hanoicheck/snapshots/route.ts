import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '../../../../../generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'no-store' };
const statuses = new Set(['PENDING', 'APPROVED', 'REJECTED']);

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const requestedStatus = (searchParams.get('status') || 'PENDING').toUpperCase();
  if (requestedStatus !== 'ALL' && !statuses.has(requestedStatus)) {
    return NextResponse.json({ error: 'Trạng thái bản nguồn không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }
  const page = positiveInteger(searchParams.get('page'), 1, 1_000_000);
  const pageSize = positiveInteger(searchParams.get('pageSize'), 30, 50);
  const where: Prisma.HanoiCheckSnapshotWhereInput = requestedStatus === 'ALL' ? {} : { status: requestedStatus };

  const [total, rows, pending, approved, rejected] = await Promise.all([
    prisma.hanoiCheckSnapshot.count({ where }),
    prisma.hanoiCheckSnapshot.findMany({
      where,
      orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sourceKey: true,
        sourceUrl: true,
        payloadHash: true,
        status: true,
        reason: true,
        batchId: true,
        fetchedAt: true,
        reviewedAt: true,
        batch: {
          select: {
            id: true,
            publicId: true,
            code: true,
            name: true,
            isPublic: true,
            sourceReviewStatus: true,
            product: { select: { id: true, name: true, supplier: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    }),
    prisma.hanoiCheckSnapshot.count({ where: { status: 'PENDING' } }),
    prisma.hanoiCheckSnapshot.count({ where: { status: 'APPROVED' } }),
    prisma.hanoiCheckSnapshot.count({ where: { status: 'REJECTED' } }),
  ]);

  return NextResponse.json({
    items: rows,
    total,
    page,
    pageSize,
    counts: { pending, approved, rejected },
  }, { headers: privateHeaders });
}
