import { prisma } from './prisma';
import type { PrismaClient } from '../generated/prisma/client';
import type { HcTraceDetail } from './hanoicheck-trace';
import { sourceIdentity, payloadHash, sourceSupplierCode, validateSourceDates, parseVietnameseDate } from './hanoicheck-normalize';

export type BatchSyncOutcome = { batchCode: string; publicId: string | null; snapshotId: number; action: 'created' | 'pending' | 'unchanged' };

// This boundary is intentionally independent of HTTP. Integration tests use an isolated DB.
export async function stageHanoiCheckBatch(url: string, detail: HcTraceDetail, rawHtml: string, db: PrismaClient = prisma): Promise<BatchSyncOutcome> {
  const { sourceKey, sourceUrl } = sourceIdentity(url, detail);
  if (!detail.batchCode) throw new Error('Không đọc được mã lô từ trang truy xuất.');
  const hash = payloadHash(detail);
  let code: string | null = null, reason: string | null = null;
  try { code = sourceSupplierCode(detail); validateSourceDates(detail); } catch (error) { reason = (error as Error).message; }
  if (!code && !reason) reason = 'Chưa nhận diện được mã NCC; cần ánh xạ nguồn.';
  return db.$transaction(async tx => {
    const mapping = code ? await tx.hanoiCheckSupplierMapping.findUnique({ where: { externalCode: code } }) : null;
    if (!mapping && !reason) reason = `Chưa duyệt ánh xạ mã nguồn ${code}.`;
    let batch = await tx.batch.findUnique({ where: { sourceKey } });
    // Upgrade a legacy key only when the saved URL identifies exactly the same source.
    if (!batch) {
      const candidates = await tx.batch.findMany({ where: { sourceSystem: 'HANOICHECK', OR: [{ sourceTraceUrl: sourceUrl }, { sourceTraceUrl: `${sourceUrl}/` }, { sourceKey: detail.batchCode }] } });
      const exact = candidates.filter(item => { try { return item.sourceTraceUrl && sourceIdentity(item.sourceTraceUrl).sourceKey === sourceKey; } catch { return false; } });
      if (exact.length > 1) throw new Error('Có nhiều lô nội bộ cùng URL nguồn; cần đối chiếu trước khi nhập.');
      if (exact[0]) batch = await tx.batch.update({ where: { id: exact[0].id }, data: { sourceKey } });
    }
    if (batch && mapping) {
      const product = await tx.product.findUniqueOrThrow({ where: { id: batch.productId } });
      if (product.supplierId !== mapping.supplierId) reason = 'NCC của lô nội bộ khác ánh xạ nguồn; giữ nguyên dữ liệu nội bộ để đối chiếu.';
    }
    let savedSnapshot = await tx.hanoiCheckSnapshot.findUnique({ where: { sourceKey_payloadHash: { sourceKey, payloadHash: hash } } });
    // A vendor can revert byte-for-byte to an older payload that was approved
    // before the currently accepted version. The unique snapshot is immutable
    // evidence, but its review state must be reopened and moved to the head of
    // the observation timeline so the reversion cannot pass as "unchanged".
    if (savedSnapshot && batch && savedSnapshot.status !== 'REJECTED' && batch.sourcePayloadHash !== hash) {
      const latest = await tx.hanoiCheckSnapshot.findFirst({
        where: { sourceKey },
        orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
        select: { fetchedAt: true },
      });
      const fetchedAt = new Date(Math.max(Date.now(), (latest?.fetchedAt.getTime() ?? 0) + 1));
      savedSnapshot = await tx.hanoiCheckSnapshot.update({
        where: { id: savedSnapshot.id },
        data: {
          status: 'PENDING',
          reviewedAt: null,
          fetchedAt,
          reason: reason || 'Nguồn quay lại một phiên bản cũ; cần đối chiếu lại với bản đang được Sunfood chấp nhận.',
        },
      });
      await tx.auditLog.create({
        data: { action: 'SYNC', entity: 'HANOICHECK_SNAPSHOT', entityId: String(savedSnapshot.id), summary: `Nguồn ${sourceKey} quay lại payload lịch sử; mở lại bản chờ đối chiếu, không thay dữ liệu đang công bố.` },
      });
    }
    if (savedSnapshot && (savedSnapshot.batchId || savedSnapshot.status === 'REJECTED')) {
      if (batch) {
        const restoresAcceptedSnapshot = savedSnapshot.status === 'APPROVED'
          && batch.sourcePayloadHash === hash && detail.verified && !reason;
        await tx.batch.update({ where: { id: batch.id }, data: {
          sourceSyncedAt: new Date(),
          // Trust conditions can change independently of payload bytes (for
          // example, an operator changes the approved NCC mapping). Replays must
          // therefore re-evaluate the hold even when the snapshot already exists.
          ...(!detail.verified || reason ? { sourceReviewStatus: 'NEEDS_REVIEW', isPublic: false }
            : restoresAcceptedSnapshot ? { sourceReviewStatus: 'APPROVED', sourceVerified: true } : {}),
        } });
      }
      return { batchCode: detail.batchCode!, publicId: batch?.publicId || null, snapshotId: savedSnapshot.id, action: savedSnapshot.status === 'PENDING' ? 'pending' : 'unchanged' };
    }
    let created = false;
    if (!batch && !reason && mapping) {
      if (!detail.foodCode || !detail.productName) reason = 'Nguồn thiếu mã/tên sản phẩm; chưa tạo lô.';
      else {
        const product = await tx.product.upsert({
          where: { supplierId_sku: { supplierId: mapping.supplierId, sku: detail.foodCode } },
          create: { supplierId: mapping.supplierId, sku: detail.foodCode, name: detail.productName, origin: detail.origin },
          update: {}, // A later source import must never overwrite curated product fields.
        });
        const collision = await tx.batch.findUnique({ where: { productId_code: { productId: product.id, code: detail.batchCode! } } });
        if (collision) {
          // Keep the conflicting source as a reviewable snapshot. Linking it to the
          // existing batch would collapse two HanoiCheck connections into one QR.
          reason = 'Mã lô trùng trong cùng sản phẩm nhưng khác định danh nguồn; cần đối chiếu.';
        } else {
          batch = await tx.batch.create({ data: {
            productId: product.id, code: detail.batchCode!, name: detail.batchName,
            receivedAt: parseVietnameseDate(detail.importedAt), producedAt: parseVietnameseDate(detail.producedAt), expiresAt: parseVietnameseDate(detail.expiresAt),
            sourceSystem: 'HANOICHECK', sourceKey, sourceTraceUrl: sourceUrl, sourceSyncedAt: new Date(), sourceReviewStatus: 'PENDING',
          } });
          created = true;
        }
      }
    }
    const snapshot = await tx.hanoiCheckSnapshot.upsert({
      where: { sourceKey_payloadHash: { sourceKey, payloadHash: hash } },
      create: { sourceKey, sourceUrl, payloadHash: hash, payload: JSON.stringify(detail), rawHtml, batchId: batch?.id, reason },
      update: { batchId: batch?.id, reason },
    });
    if (batch) await tx.batch.update({ where: { id: batch.id }, data: {
      sourceSyncedAt: new Date(),
      // A revoked source requires another review; never silently advertise the old verification.
      ...(!detail.verified || reason ? { sourceReviewStatus: 'NEEDS_REVIEW', isPublic: false } : {}),
    } });
    await tx.auditLog.create({ data: { action: 'SYNC', entity: 'HANOICHECK_SNAPSHOT', entityId: String(snapshot.id), summary: `Tiếp nhận bản nguồn ${sourceKey}; ${reason || 'chờ duyệt'}, giữ nguyên dữ liệu đã công bố.` } });
    return { batchCode: detail.batchCode!, publicId: batch?.publicId || null, snapshotId: snapshot.id, action: created ? 'created' : 'pending' };
  });
}

export const SOURCE_REVIEW_FIELDS = ['name', 'receivedAt', 'producedAt', 'expiresAt'] as const;
type ReviewField = typeof SOURCE_REVIEW_FIELDS[number];

export async function reviewHanoiCheckSnapshot(id: number, expectedHash: string, decision: 'approve' | 'reject', fields: ReviewField[], db: PrismaClient = prisma) {
  if (!Number.isInteger(id) || id < 1 || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Yêu cầu duyệt bản nguồn không hợp lệ.');
  if (fields.length > SOURCE_REVIEW_FIELDS.length || fields.some(field => !SOURCE_REVIEW_FIELDS.includes(field))) {
    throw new Error('Trường dữ liệu được chọn không hợp lệ.');
  }
  fields = [...new Set(fields)];
  return db.$transaction(async tx => {
    const snapshot = await tx.hanoiCheckSnapshot.findUniqueOrThrow({ where: { id }, include: { batch: { include: { product: true } } } });
    if (snapshot.status !== 'PENDING' || snapshot.payloadHash !== expectedHash) throw new Error('Bản nguồn đã thay đổi hoặc đã được duyệt.');
    if (decision === 'reject') {
      await tx.hanoiCheckSnapshot.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: new Date() } });
    } else {
      const batch = snapshot.batch;
      if (!batch) throw new Error('Cần duyệt ánh xạ NCC và nhập lại URL trước khi duyệt bản nguồn.');
      const newest = await tx.hanoiCheckSnapshot.findFirst({ where: { sourceKey: snapshot.sourceKey }, orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }] });
      if (newest?.id !== id) throw new Error('Đã có bản nguồn mới hơn; tải lại danh sách để đối chiếu.');
      const detail = JSON.parse(snapshot.payload) as HcTraceDetail;
      validateSourceDates(detail);
      if (!detail.verified) throw new Error('Nguồn HanoiCheck chưa xác thực; chưa được duyệt công khai.');
      const code = sourceSupplierCode(detail);
      const mapping = code ? await tx.hanoiCheckSupplierMapping.findUnique({ where: { externalCode: code } }) : null;
      if (!mapping || mapping.supplierId !== batch.product.supplierId) throw new Error('Ánh xạ NCC chưa được đối chiếu hoặc không khớp lô.');
      const proposed = { name: detail.batchName, receivedAt: parseVietnameseDate(detail.importedAt), producedAt: parseVietnameseDate(detail.producedAt), expiresAt: parseVietnameseDate(detail.expiresAt) };
      const changes = Object.fromEntries(fields.map(field => [field, proposed[field]]));
      const resulting = { ...batch, ...changes };
      if (resulting.producedAt && resulting.expiresAt && new Date(resulting.expiresAt) < new Date(resulting.producedAt)) throw new Error('Các ngày được chọn tạo ra hạn dùng trước ngày sản xuất.');
      await tx.batch.update({ where: { id: batch.id }, data: { ...changes, sourcePayload: snapshot.payload, sourcePayloadHash: snapshot.payloadHash, sourceVerified: true, sourceReviewStatus: 'APPROVED' } });
      await tx.hanoiCheckSnapshot.update({ where: { id }, data: { status: 'APPROVED', reviewedAt: new Date() } });
    }
    await tx.auditLog.create({ data: { action: decision === 'approve' ? 'APPROVE' : 'REJECT', entity: 'HANOICHECK_SNAPSHOT', entityId: String(id), summary: `${decision === 'approve' ? 'Duyệt' : 'Từ chối'} bản nguồn ${snapshot.sourceKey}; trường chọn: ${fields.join(', ') || 'giữ nguyên dữ liệu nội bộ'}.` } });
    return { ok: true };
  });
}
