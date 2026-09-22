import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';

export const dynamic = 'force-dynamic';

const value = (input: unknown, max = 250) => String(input ?? '').trim().slice(0, max);
const optional = (input: unknown, max = 250) => value(input, max) || null;
const date = (input: unknown) => input ? new Date(String(input)) : null;
const validDate = (input: Date | null) => !input || !Number.isNaN(input.getTime());

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const suppliers = await prisma.supplier.findMany({ select: { id: true, code: true, name: true, status: true, verificationStatus: true, products: { include: { batches: { include: { events: { orderBy: { occurredAt: 'asc' } } }, orderBy: { id: 'desc' } } }, orderBy: { id: 'desc' } } }, orderBy: { code: 'asc' } });
  return NextResponse.json(suppliers);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const type = value(body.type);
  try {
    if (type === 'product') {
      const supplierId = Number(body.supplierId);
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier || !value(body.name)) return NextResponse.json({ error: 'Chọn NCC và nhập tên sản phẩm.' }, { status: 400 });
      const gtin = optional(body.gtin, 14);
      if (gtin && !/^\d{8,14}$/.test(gtin)) return NextResponse.json({ error: 'GTIN phải gồm 8–14 chữ số.' }, { status: 400 });
      const product = await prisma.product.create({ data: { supplierId, name: value(body.name), sku: optional(body.sku), gtin, origin: optional(body.origin), unit: optional(body.unit), storage: optional(body.storage) } });
      await prisma.auditLog.create({ data: { supplierId, action: 'CREATE', entity: 'PRODUCT', entityId: String(product.id), summary: `Tạo sản phẩm nháp ${product.name} cho ${supplier.code}` } });
      return NextResponse.json(product, { status: 201 });
    }
    if (type === 'batch') {
      const productId = Number(body.productId);
      const product = await prisma.product.findUnique({ where: { id: productId } });
      const code = value(body.code, 100);
      const receivedAt = date(body.receivedAt); const producedAt = date(body.producedAt); const expiresAt = date(body.expiresAt);
      if (!product || !code || !validDate(receivedAt) || !validDate(producedAt) || !validDate(expiresAt) || (producedAt && expiresAt && expiresAt < producedAt)) return NextResponse.json({ error: 'Mã lô hoặc ngày tháng không hợp lệ.' }, { status: 400 });
      const batch = await prisma.batch.create({ data: { productId, code, receivedAt, producedAt, expiresAt } });
      await prisma.auditLog.create({ data: { supplierId: product.supplierId, action: 'CREATE', entity: 'BATCH', entityId: String(batch.id), summary: `Tạo lô nháp ${code}` } });
      return NextResponse.json(batch, { status: 201 });
    }
    if (type === 'event') {
      const batchId = Number(body.batchId);
      const batch = await prisma.batch.findUnique({ where: { id: batchId, }, include: { product: true } });
      const occurredAt = date(body.occurredAt);
      if (!batch || !occurredAt || !validDate(occurredAt) || occurredAt > new Date() || !value(body.title) || !value(body.stage)) return NextResponse.json({ error: 'Sự kiện thiếu thông tin hoặc ngày nằm trong tương lai.' }, { status: 400 });
      const event = await prisma.traceEvent.create({ data: { batchId, occurredAt, stage: value(body.stage), title: value(body.title), details: optional(body.details, 1000), location: optional(body.location) } });
      await prisma.auditLog.create({ data: { supplierId: batch.product.supplierId, action: 'CREATE', entity: 'TRACE_EVENT', entityId: String(event.id), summary: `Tạo sự kiện nháp cho lô ${batch.code}` } });
      return NextResponse.json(event, { status: 201 });
    }
    return NextResponse.json({ error: 'Loại dữ liệu không hợp lệ.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Trùng mã lô hoặc không lưu được dữ liệu.' }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id); const type = value(body.type); const isPublic = body.isPublic;
  if (!Number.isSafeInteger(id) || id < 1 || typeof isPublic !== 'boolean') return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });
  if (type === 'product') {
    const product = await prisma.product.findUnique({ where: { id }, include: { supplier: true } });
    if (!product) return NextResponse.json({ error: 'Không tìm thấy sản phẩm.' }, { status: 404 });
    if (isPublic && (product.supplier.verificationStatus !== 'VERIFIED' || product.supplier.status !== 'ACTIVE')) return NextResponse.json({ error: 'Cần xác minh NCC đang hoạt động trước khi công khai sản phẩm.' }, { status: 409 });
    if (!isPublic && await prisma.batch.count({ where: { productId: id, isPublic: true } })) return NextResponse.json({ error: 'Ẩn các lô công khai trước.' }, { status: 409 });
    await prisma.product.update({ where: { id }, data: { isPublic } });
    await prisma.auditLog.create({ data: { supplierId: product.supplierId, action: 'PUBLISH', entity: 'PRODUCT', entityId: String(id), summary: `${isPublic ? 'Công khai' : 'Ẩn'} sản phẩm ${product.name}` } });
  } else if (type === 'batch') {
    const batch = await prisma.batch.findUnique({ where: { id }, include: { product: { include: { supplier: true } } } });
    if (!batch) return NextResponse.json({ error: 'Không tìm thấy lô.' }, { status: 404 });
    if (isPublic && (!batch.product.isPublic || batch.product.supplier.verificationStatus !== 'VERIFIED' || !batch.receivedAt || batch.receivedAt > new Date() || (batch.producedAt && batch.producedAt > new Date()))) return NextResponse.json({ error: 'Cần duyệt sản phẩm/NCC và xác minh ngày nhập lô hợp lệ trước khi công khai.' }, { status: 409 });
    await prisma.batch.update({ where: { id }, data: { isPublic, everPublished: isPublic ? true : batch.everPublished } });
    await prisma.auditLog.create({ data: { supplierId: batch.product.supplierId, action: 'PUBLISH', entity: 'BATCH', entityId: String(id), summary: `${isPublic ? 'Công khai' : 'Ẩn'} lô ${batch.code}` } });
  } else if (type === 'event') {
    const event = await prisma.traceEvent.findUnique({ where: { id }, include: { batch: { include: { product: true } } } });
    if (!event) return NextResponse.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
    if (isPublic && (!event.batch.isPublic || event.occurredAt > new Date())) return NextResponse.json({ error: 'Lô chưa công khai hoặc sự kiện trong tương lai.' }, { status: 409 });
    await prisma.traceEvent.update({ where: { id }, data: { isPublic } });
    await prisma.auditLog.create({ data: { supplierId: event.batch.product.supplierId, action: 'PUBLISH', entity: 'TRACE_EVENT', entityId: String(id), summary: `${isPublic ? 'Công khai' : 'Ẩn'} sự kiện ${event.title}` } });
  } else return NextResponse.json({ error: 'Loại dữ liệu không hợp lệ.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
