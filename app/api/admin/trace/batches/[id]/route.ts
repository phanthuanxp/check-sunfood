import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });
  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true, sku: true, gtin: true, origin: true, unit: true, storage: true, hygieneCertNumber: true, isPublic: true, supplier: { select: { id: true, code: true, name: true, verificationStatus: true, status: true } } } },
      events: { orderBy: { occurredAt: 'asc' } },
    },
  });
  if (!batch) return NextResponse.json({ error: 'Không tìm thấy lô.' }, { status: 404 });
  const { product, events, ...rest } = batch;
  const { supplier, ...productRest } = product;
  const status = batch.isPublic ? 'PUBLIC' : batch.everPublished ? 'HIDDEN' : 'DRAFT';
  return NextResponse.json({
    ...rest, status, product: productRest, supplier, events,
    eventsTotal: events.length, eventsPublic: events.filter(event => event.isPublic).length,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
