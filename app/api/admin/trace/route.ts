import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { setProductPublic, setBatchPublic, setEventPublic } from '@/lib/trace-publish';

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
      const product = await prisma.product.create({ data: { supplierId, name: value(body.name), sku: optional(body.sku), gtin, origin: optional(body.origin), unit: optional(body.unit), storage: optional(body.storage), imageUrl: optional(body.imageUrl, 500) } });
      await prisma.auditLog.create({ data: { supplierId, action: 'CREATE', entity: 'PRODUCT', entityId: String(product.id), summary: `Tạo sản phẩm nháp ${product.name} cho ${supplier.code}` } });
      return NextResponse.json(product, { status: 201 });
    }
    if (type === 'batch') {
      const code = value(body.code, 100);
      const receivedAt = date(body.receivedAt); const producedAt = date(body.producedAt); const expiresAt = date(body.expiresAt);
      if (!code || !validDate(receivedAt) || !validDate(producedAt) || !validDate(expiresAt) || (producedAt && expiresAt && expiresAt < producedAt)) return NextResponse.json({ error: 'Mã lô hoặc ngày tháng không hợp lệ.' }, { status: 400 });
      const newProduct = body.newProduct as { supplierId?: unknown; name?: unknown; sku?: unknown } | undefined;
      if (newProduct) {
        const supplier = await prisma.supplier.findUnique({ where: { id: Number(newProduct.supplierId) } });
        if (!supplier || !value(newProduct.name)) return NextResponse.json({ error: 'Chọn NCC và nhập tên sản phẩm mới.' }, { status: 400 });
      } else {
        const existing = await prisma.product.findUnique({ where: { id: Number(body.productId) } });
        if (!existing) return NextResponse.json({ error: 'Không tìm thấy sản phẩm.' }, { status: 400 });
      }
      // Create the (optional) new product and its first batch in one transaction so a
      // batch-creation failure (e.g. duplicate code) never leaves an orphan product behind.
      const { batch, product } = await prisma.$transaction(async tx => {
        const product = newProduct
          ? await tx.product.create({ data: { supplierId: Number(newProduct.supplierId), name: value(newProduct.name), sku: optional(newProduct.sku) } })
          : await tx.product.findUniqueOrThrow({ where: { id: Number(body.productId) } });
        const batch = await tx.batch.create({ data: { productId: product.id, code, name: optional(body.name, 250), receivedAt, producedAt, expiresAt } });
        return { batch, product };
      });
      const summary = newProduct ? `Tạo lô nháp ${code} kèm sản phẩm mới ${product.name}` : `Tạo lô nháp ${code}`;
      await prisma.auditLog.create({ data: { supplierId: product.supplierId, action: 'CREATE', entity: 'BATCH', entityId: String(batch.id), summary } });
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

export async function PUT(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const type = value(body.type);
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });
  try {
    if (type === 'product') {
      const product = await prisma.product.findUnique({ where: { id } });
      if (!product || !value(body.name)) return NextResponse.json({ error: 'Không tìm thấy sản phẩm hoặc thiếu tên.' }, { status: 400 });
      const gtin = optional(body.gtin, 14);
      if (gtin && !/^\d{8,14}$/.test(gtin)) return NextResponse.json({ error: 'GTIN phải gồm 8–14 chữ số.' }, { status: 400 });
      const supplierId = Number(body.supplierId ?? product.supplierId);
      const supplier = supplierId === product.supplierId ? product : await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) return NextResponse.json({ error: 'Không tìm thấy nhà cung cấp.' }, { status: 400 });
      const data = {
        supplierId, name: value(body.name), sku: optional(body.sku), gtin, storage: optional(body.storage), hygieneCertNumber: optional(body.hygieneCertNumber, 100), imageUrl: optional(body.imageUrl, 500),
        origin: body.origin === undefined ? product.origin : optional(body.origin),
        unit: body.unit === undefined ? product.unit : optional(body.unit),
      };
      const updated = await prisma.product.update({ where: { id }, data });
      const summary = supplierId !== product.supplierId ? `Sửa sản phẩm ${updated.name} (chuyển sang NCC #${supplierId})` : `Sửa sản phẩm ${updated.name}`;
      await prisma.auditLog.create({ data: { supplierId, action: 'UPDATE', entity: 'PRODUCT', entityId: String(id), summary } });
      return NextResponse.json(updated);
    }
    if (type === 'batch') {
      const batch = await prisma.batch.findUnique({ where: { id }, include: { product: true } });
      const code = value(body.code, 100);
      const receivedAt = date(body.receivedAt); const producedAt = date(body.producedAt); const expiresAt = date(body.expiresAt);
      if (!batch || !code || !validDate(receivedAt) || !validDate(producedAt) || !validDate(expiresAt) || (producedAt && expiresAt && expiresAt < producedAt)) return NextResponse.json({ error: 'Mã lô hoặc ngày tháng không hợp lệ.' }, { status: 400 });
      const updated = await prisma.batch.update({ where: { id }, data: { code, name: optional(body.name, 250), receivedAt, producedAt, expiresAt } });
      await prisma.auditLog.create({ data: { supplierId: batch.product.supplierId, action: 'UPDATE', entity: 'BATCH', entityId: String(id), summary: `Sửa lô ${code}` } });
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: 'Loại dữ liệu không hợp lệ.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Trùng mã lô hoặc không lưu được thay đổi.' }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id); const type = value(body.type); const isPublic = body.isPublic;
  if (!Number.isSafeInteger(id) || id < 1 || typeof isPublic !== 'boolean') return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });
  const result = type === 'product' ? await setProductPublic(id, isPublic)
    : type === 'batch' ? await setBatchPublic(id, isPublic)
    : type === 'event' ? await setEventPublic(id, isPublic)
    : null;
  if (!result) return NextResponse.json({ error: 'Loại dữ liệu không hợp lệ.' }, { status: 400 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
