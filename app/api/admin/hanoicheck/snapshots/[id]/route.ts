import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { reviewHanoiCheckSnapshot, SOURCE_REVIEW_FIELDS } from '@/lib/hanoicheck-import-store';
import { parseVietnameseDate, sourceSupplierCode } from '@/lib/hanoicheck-normalize';
import type { HcTraceDetail } from '@/lib/hanoicheck-trace';
import { prisma } from '@/lib/prisma';
import { rejectUntrustedMutation } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'no-store' };
type ReviewField = typeof SOURCE_REVIEW_FIELDS[number];

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseSource(payload: string): HcTraceDetail | null {
  try {
    const value = JSON.parse(payload) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as HcTraceDetail : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = validId((await params).id);
  if (!id) return NextResponse.json({ error: 'ID bản nguồn không hợp lệ.' }, { status: 400, headers: privateHeaders });

  const snapshot = await prisma.hanoiCheckSnapshot.findUnique({
    where: { id },
    select: {
      id: true,
      sourceKey: true,
      sourceUrl: true,
      payloadHash: true,
      payload: true,
      status: true,
      reason: true,
      fetchedAt: true,
      reviewedAt: true,
      batch: {
        include: {
          product: { include: { supplier: { select: { id: true, code: true, name: true, status: true, verificationStatus: true } } } },
        },
      },
    },
  });
  if (!snapshot) return NextResponse.json({ error: 'Không tìm thấy bản nguồn.' }, { status: 404, headers: privateHeaders });
  const source = parseSource(snapshot.payload);
  if (!source) return NextResponse.json({ error: 'Dữ liệu nguồn đã lưu bị lỗi; không thể duyệt.' }, { status: 422, headers: privateHeaders });

  let externalCode: string | null = null;
  let supplierCodeError: string | null = null;
  try { externalCode = sourceSupplierCode(source); }
  catch (error) { supplierCodeError = error instanceof Error ? error.message : 'Không đọc được mã NCC nguồn.'; }
  const [mapping, newest] = await Promise.all([
    externalCode ? prisma.hanoiCheckSupplierMapping.findUnique({
      where: { externalCode },
      include: { supplier: { select: { id: true, code: true, name: true, status: true, verificationStatus: true } } },
    }) : null,
    prisma.hanoiCheckSnapshot.findFirst({ where: { sourceKey: snapshot.sourceKey }, orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }], select: { id: true } }),
  ]);

  const batch = snapshot.batch;
  const comparison = [
    { field: 'name', label: 'Tên lô', local: batch?.name ?? null, source: source.batchName },
    { field: 'receivedAt', label: 'Ngày nhập lô', local: batch?.receivedAt ?? null, source: parseVietnameseDate(source.importedAt), sourceDisplay: source.importedAt },
    { field: 'producedAt', label: 'Ngày sản xuất', local: batch?.producedAt ?? null, source: parseVietnameseDate(source.producedAt), sourceDisplay: source.producedAt },
    { field: 'expiresAt', label: 'Hạn sử dụng', local: batch?.expiresAt ?? null, source: parseVietnameseDate(source.expiresAt), sourceDisplay: source.expiresAt },
  ];
  const metadata = {
    id: snapshot.id,
    sourceKey: snapshot.sourceKey,
    sourceUrl: snapshot.sourceUrl,
    payloadHash: snapshot.payloadHash,
    status: snapshot.status,
    reason: snapshot.reason,
    fetchedAt: snapshot.fetchedAt,
    reviewedAt: snapshot.reviewedAt,
  };
  const local = batch ? {
    id: batch.id,
    publicId: batch.publicId,
    code: batch.code,
    name: batch.name,
    receivedAt: batch.receivedAt,
    producedAt: batch.producedAt,
    expiresAt: batch.expiresAt,
    sourceSystem: batch.sourceSystem,
    sourceKey: batch.sourceKey,
    sourceTraceUrl: batch.sourceTraceUrl,
    sourceSyncedAt: batch.sourceSyncedAt,
    sourcePayloadHash: batch.sourcePayloadHash,
    sourceVerified: batch.sourceVerified,
    sourceReviewStatus: batch.sourceReviewStatus,
    everPublished: batch.everPublished,
    isPublic: batch.isPublic,
    product: batch.product,
  } : null;
  return NextResponse.json({
    ...metadata,
    source,
    local,
    comparison,
    reviewFields: SOURCE_REVIEW_FIELDS,
    isLatest: newest?.id === id,
    supplierMatch: {
      externalCode,
      error: supplierCodeError,
      mapping,
      matchesBatch: Boolean(mapping && batch && mapping.supplierId === batch.product.supplierId),
    },
  }, { headers: privateHeaders });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const id = validId((await params).id);
  if (!id) return NextResponse.json({ error: 'ID bản nguồn không hợp lệ.' }, { status: 400, headers: privateHeaders });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Dữ liệu duyệt không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'Quyết định duyệt không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }
  if (typeof body.expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedHash)) {
    return NextResponse.json({ error: 'Mã kiểm tra bản nguồn không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }
  const requestedFields: unknown = body.fields === undefined ? [] : body.fields;
  if (!Array.isArray(requestedFields) || requestedFields.some(field => typeof field !== 'string' || !SOURCE_REVIEW_FIELDS.includes(field as ReviewField))) {
    return NextResponse.json({ error: 'Danh sách trường được duyệt không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }
  const fields = [...new Set(requestedFields)] as ReviewField[];
  if (body.decision === 'reject' && fields.length) {
    return NextResponse.json({ error: 'Không chọn trường cập nhật khi từ chối bản nguồn.' }, { status: 400, headers: privateHeaders });
  }

  try {
    await reviewHanoiCheckSnapshot(id, body.expectedHash, body.decision, fields);
    return NextResponse.json({ ok: true, status: body.decision === 'approve' ? 'APPROVED' : 'REJECTED' }, { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể duyệt bản nguồn.';
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const status = code === 'P2025' ? 404 : message.includes('đã thay đổi') || message.includes('mới hơn') ? 409 : 422;
    return NextResponse.json({ error: message }, { status, headers: privateHeaders });
  }
}
