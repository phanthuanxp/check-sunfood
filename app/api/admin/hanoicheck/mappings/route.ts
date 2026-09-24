import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { sourceSupplierCode } from '@/lib/hanoicheck-normalize';
import type { HcTraceDetail } from '@/lib/hanoicheck-trace';
import { prisma } from '@/lib/prisma';
import { rejectUntrustedMutation } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'no-store' };
const externalCodePattern = /^NCC-\d{2}$/;

function snapshotReferencesCode(payload: string, externalCode: string) {
  try {
    const source = JSON.parse(payload) as HcTraceDetail;
    return sourceSupplierCode(source) === externalCode;
  } catch {
    // A corrupt or ambiguous historical snapshot must fail closed during a
    // mapping change when it still contains the affected supplier code.
    return payload.toUpperCase().includes(externalCode);
  }
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [mappings, suppliers] = await Promise.all([
    prisma.hanoiCheckSupplierMapping.findMany({
      orderBy: { externalCode: 'asc' },
      include: { supplier: { select: { id: true, code: true, name: true, status: true, verificationStatus: true } } },
    }),
    prisma.supplier.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, status: true, verificationStatus: true },
    }),
  ]);
  return NextResponse.json({ mappings, suppliers }, { headers: privateHeaders });
}

export async function PUT(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Dữ liệu ánh xạ không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }
  const externalCode = typeof body.externalCode === 'string' ? body.externalCode.trim().toUpperCase() : '';
  const supplierId = body.supplierId;
  if (!externalCodePattern.test(externalCode)) {
    return NextResponse.json({ error: 'Mã nguồn phải đúng định dạng NCC-xx.' }, { status: 400, headers: privateHeaders });
  }
  if (typeof supplierId !== 'number' || !Number.isSafeInteger(supplierId) || supplierId < 1) {
    return NextResponse.json({ error: 'Nhà cung cấp được chọn không hợp lệ.' }, { status: 400, headers: privateHeaders });
  }

  const result = await prisma.$transaction(async tx => {
    const [supplier, current] = await Promise.all([
      tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true, code: true, name: true, status: true, verificationStatus: true } }),
      tx.hanoiCheckSupplierMapping.findUnique({ where: { externalCode }, include: { supplier: { select: { code: true, name: true } } } }),
    ]);
    if (!supplier) return null;
    let heldBatchIds: number[] = [];
    if (current && current.supplierId !== supplierId) {
      const linkedSnapshots = await tx.hanoiCheckSnapshot.findMany({
        where: { batchId: { not: null } },
        select: { batchId: true, payload: true },
      });
      heldBatchIds = [...new Set(linkedSnapshots
        .filter(snapshot => snapshot.batchId && snapshotReferencesCode(snapshot.payload, externalCode))
        .map(snapshot => snapshot.batchId as number))];
      if (heldBatchIds.length) {
        await tx.batch.updateMany({
          where: { id: { in: heldBatchIds } },
          data: { sourceReviewStatus: 'NEEDS_REVIEW', isPublic: false },
        });
      }
    }
    const approvedAt = new Date();
    const mapping = await tx.hanoiCheckSupplierMapping.upsert({
      where: { externalCode },
      create: { externalCode, supplierId, approvedAt },
      update: { supplierId, approvedAt },
      include: { supplier: { select: { id: true, code: true, name: true, status: true, verificationStatus: true } } },
    });
    const from = current ? `${current.supplier.code} - ${current.supplier.name}` : 'chưa ánh xạ';
    await tx.auditLog.create({
      data: {
        supplierId,
        action: current ? 'UPDATE' : 'CREATE',
        entity: 'HANOICHECK_SUPPLIER_MAPPING',
        entityId: externalCode,
        summary: `Duyệt ánh xạ ${externalCode}: ${from} → ${supplier.code} - ${supplier.name}.${heldBatchIds.length ? ` Đã ẩn ${heldBatchIds.length} lô liên quan để đối chiếu lại.` : ''}`,
      },
    });
    return { mapping, heldBatchCount: heldBatchIds.length };
  });

  if (!result) return NextResponse.json({ error: 'Không tìm thấy nhà cung cấp.' }, { status: 404, headers: privateHeaders });
  return NextResponse.json(result, { headers: privateHeaders });
}
