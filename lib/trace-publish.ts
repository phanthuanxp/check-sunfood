import { prisma } from '@/lib/prisma';

export type PublishResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

type BatchAvailability = {
  isPublic: boolean;
  sourceSystem?: string | null;
  sourcePayload?: string | null;
  sourceVerified?: boolean | null;
  sourceReviewStatus?: string | null;
  product: { isPublic: boolean; supplier: { verificationStatus: string; status: string } };
};

function hasVerifiedLegacyPayload(payload: string | null | undefined) {
  if (!payload) return false;
  try {
    const parsed = JSON.parse(payload) as { verified?: unknown };
    return parsed?.verified === true;
  } catch { return false; }
}

/** Local lots use Sunfood's own approval flow. HanoiCheck lots additionally require verified source evidence. */
export function isBatchSourceApproved(batch: Pick<BatchAvailability, 'sourceSystem' | 'sourcePayload' | 'sourceVerified' | 'sourceReviewStatus'>) {
  if (batch.sourceSystem !== 'HANOICHECK') return true;
  if (batch.sourceReviewStatus === 'APPROVED') return batch.sourceVerified === true;
  return batch.sourceReviewStatus === 'LEGACY' && hasVerifiedLegacyPayload(batch.sourcePayload);
}

/**
 * Single source of truth for "is this batch actually visible on the public site right now" —
 * used by the /lot and /lot/print pages. Keep this in sync with setBatchPublic's approval gate
 * below; duplicating this formula per-page previously let them drift out of sync (a batch could
 * be approved in the admin but still show as unavailable on the public page).
 */
export function isBatchAvailable(batch: BatchAvailability) {
  return batch.isPublic && batch.product.isPublic && batch.product.supplier.verificationStatus === 'VERIFIED' &&
    batch.product.supplier.status === 'ACTIVE' && isBatchSourceApproved(batch);
}

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
  if (isPublic && (!batch.product.isPublic || batch.product.supplier.verificationStatus !== 'VERIFIED' || batch.product.supplier.status !== 'ACTIVE' || !batch.receivedAt))
    return { ok: false, status: 409, error: 'Cần duyệt sản phẩm, xác minh NCC đang hoạt động và điền ngày nhập lô trước khi công khai.' };
  if (isPublic && !isBatchSourceApproved(batch))
    return { ok: false, status: 409, error: 'Lô HanoiCheck phải có nguồn đã xác thực và được Sunfood đối chiếu trước khi công khai.' };
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
