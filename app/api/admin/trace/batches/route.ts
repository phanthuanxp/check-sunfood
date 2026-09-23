import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import type { Prisma } from '../../../../../generated/prisma/client';

export const dynamic = 'force-dynamic';

function batchStatus(isPublic: boolean, everPublished: boolean) {
  if (isPublic) return 'PUBLIC';
  if (everPublished) return 'HIDDEN';
  return 'DRAFT';
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const supplierId = Number(searchParams.get('supplierId') || '');
  const status = searchParams.get('status') || 'all';
  const source = searchParams.get('source') || 'all';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || '30') || 30));

  const and: Prisma.BatchWhereInput[] = [];
  if (q) and.push({ OR: [{ code: { contains: q } }, { name: { contains: q } }, { product: { name: { contains: q } } }, { product: { sku: { contains: q } } }] });
  if (Number.isSafeInteger(supplierId) && supplierId > 0) and.push({ product: { supplierId } });
  if (source !== 'all') and.push({ sourceSystem: source });
  if (status === 'draft') and.push({ isPublic: false, everPublished: false });
  else if (status === 'public') and.push({ isPublic: true });
  else if (status === 'hidden') and.push({ isPublic: false, everPublished: true });
  if (dateFrom) and.push({ receivedAt: { gte: new Date(`${dateFrom}T00:00:00.000Z`) } });
  if (dateTo) and.push({ receivedAt: { lte: new Date(`${dateTo}T23:59:59.999Z`) } });

  const where: Prisma.BatchWhereInput = and.length ? { AND: and } : {};

  const [total, rows, suppliers] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: { select: { id: true, name: true, sku: true, isPublic: true, supplier: { select: { id: true, code: true, name: true, verificationStatus: true, status: true } } } },
        events: { select: { id: true, isPublic: true } },
      },
    }),
    prisma.supplier.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
  ]);

  const items = rows.map(batch => ({
    id: batch.id,
    publicId: batch.publicId,
    code: batch.code,
    name: batch.name,
    receivedAt: batch.receivedAt,
    producedAt: batch.producedAt,
    expiresAt: batch.expiresAt,
    sourceSystem: batch.sourceSystem,
    sourceTraceUrl: batch.sourceTraceUrl,
    isPublic: batch.isPublic,
    everPublished: batch.everPublished,
    status: batchStatus(batch.isPublic, batch.everPublished),
    eventsTotal: batch.events.length,
    eventsPublic: batch.events.filter(event => event.isPublic).length,
    product: { id: batch.product.id, name: batch.product.name, sku: batch.product.sku, isPublic: batch.product.isPublic },
    supplier: batch.product.supplier,
  }));

  return NextResponse.json({ items, total, page, pageSize, suppliers }, { headers: { 'Cache-Control': 'no-store' } });
}
