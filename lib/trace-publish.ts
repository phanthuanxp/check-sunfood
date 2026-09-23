import { prisma } from '@/lib/prisma';

export type PublishResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

export async function setProductPublic(id: number, isPublic: boolean): Promise<PublishResult> {
  const product = await prisma.product.findUnique({ where: { id }, include: { supplier: true } });
  if (!product) return { ok: false, status: 404, error: 'Không tìm thấy sản phẩm.' };
  if (isPublic && (product.supplier.verificationStatus !== 'VERIFIED' || product.supplier.status !== 'ACTIVE'))
    return { ok: false, status: 409, error: 'Cần xác minh NCC đang hoạt động trước khi công khai sản phẩm.' };
  if (!isPublic && await prisma.batch.count({ where: { productId: id, isPublic: true } }))
    return { ok: false, status: 409, error: 'Ẩn các lô công khai trước.' };
  await prisma.product.update({ where: { id }, data: { isPublic } });
  await prisma.auditLog.create({ data: { supplierId: product.supplierId, action: 'PUBLISH', entity: 'PRODUCT', entityId: String(id), summary: `${isPublic ? 'Công khai' : 'Ẩn'} sản phẩm ${product.name}` } });
  return { ok: true };
}

export async function setBatchPublic(id: number, isPublic: boolean): Promise<PublishResult> {
  const batch = await prisma.batch.findUnique({ where: { id }, include: { product: { include: { supplier: true } } } });
  if (!batch) return { ok: false, status: 404, error: 'Không tìm thấy lô.' };
  if (isPublic && (!batch.product.isPublic || batch.product.supplier.verificationStatus !== 'VERIFIED' || !batch.receivedAt || batch.receivedAt > new Date() || (batch.producedAt && batch.producedAt > new Date())))
    return { ok: false, status: 409, error: 'Cần duyệt sản phẩm/NCC và xác minh ngày nhập lô hợp lệ trước khi công khai.' };
  await prisma.batch.update({ where: { id }, data: { isPublic, everPublished: isPublic ? true : batch.everPublished } });
  await prisma.auditLog.create({ data: { supplierId: batch.product.supplierId, action: 'PUBLISH', entity: 'BATCH', entityId: String(id), summary: `${isPublic ? 'Công khai' : 'Ẩn'} lô ${batch.code}` } });
  return { ok: true };
}

export async function setEventPublic(id: number, isPublic: boolean): Promise<PublishResult> {
  const event = await prisma.traceEvent.findUnique({ where: { id }, include: { batch: { include: { product: true } } } });
  if (!event) return { ok: false, status: 404, error: 'Không tìm thấy sự kiện.' };
  if (isPublic && (!event.batch.isPublic || event.occurredAt > new Date()))
    return { ok: false, status: 409, error: 'Lô chưa công khai hoặc sự kiện trong tương lai.' };
  await prisma.traceEvent.update({ where: { id }, data: { isPublic } });
  await prisma.auditLog.create({ data: { supplierId: event.batch.product.supplierId, action: 'PUBLISH', entity: 'TRACE_EVENT', entityId: String(id), summary: `${isPublic ? 'Công khai' : 'Ẩn'} sự kiện ${event.title}` } });
  return { ok: true };
}
