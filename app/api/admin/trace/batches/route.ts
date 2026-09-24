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

function vietnamDayStart(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(check.getTime() - 7 * 60 * 60 * 1000);
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
  const from = dateFrom ? vietnamDayStart(dateFrom) : null;
  const to = dateTo ? vietnamDayStart(dateTo) : null;
  if ((dateFrom && !from) || (dateTo && !to) || (from && to && to < from))
    return NextResponse.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  if (from) and.push({ receivedAt: { gte: from } });
  if (to) and.push({ receivedAt: { lt: new Date(to.getTime() + 24 * 60 * 60 * 1000) } });

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
