import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import type { ImportedSupplierFields } from '@/lib/smartcheck-import';

const allowed = ['name', 'productName', 'address', 'taxCode', 'storage', 'shelfLife'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'ID không hợp lệ.' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const draft = await prisma.importDraft.findUnique({ where: { id } });
  if (!draft || draft.status !== 'PENDING') return NextResponse.json({ error: 'Bản nháp không còn chờ duyệt.' }, { status: 404 });
  const decision = String(body.decision || 'APPROVE');
  if (decision === 'REJECT') {
    await prisma.importDraft.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewNotes: String(body.notes || '').slice(0, 500) } });
    return NextResponse.json({ ok: true });
  }
  if (decision !== 'APPROVE' || !Array.isArray(body.selected)) return NextResponse.json({ error: 'Lựa chọn duyệt không hợp lệ.' }, { status: 400 });
  const proposed = JSON.parse(draft.payload) as ImportedSupplierFields;
  const edits = body.edits && typeof body.edits === 'object' ? body.edits as Record<string, unknown> : {};
  const data: ImportedSupplierFields = {};
  for (const key of allowed) {
    if (!body.selected.includes(key)) continue;
    if (!proposed[key]) return NextResponse.json({ error: `Nguồn không có trường ${key}.` }, { status: 400 });
    const value = String(edits[key] ?? proposed[key]).trim();
    if (!value || value.length > 1000) return NextResponse.json({ error: `Giá trị ${key} không hợp lệ.` }, { status: 400 });
    if (key === 'taxCode' && !/^\d{10,13}$/.test(value)) return NextResponse.json({ error: 'MST cần 10–13 chữ số và phải đối chiếu giấy tờ.' }, { status: 400 });
    data[key] = value;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Hãy chọn ít nhất một trường để duyệt.' }, { status: 400 });
  const existing = await prisma.supplier.findUnique({ where: { code: draft.code } });
  if (!existing && !data.name) return NextResponse.json({ error: 'NCC mới cần tên đã đối chiếu.' }, { status: 400 });
  try {
    await prisma.$transaction(async tx => {
      const claimed = await tx.importDraft.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewNotes: String(body.notes || '').slice(0, 500) } });
      if (claimed.count !== 1) throw new Error('Bản nháp đã được xử lý.');
      const supplier = existing
        ? await tx.supplier.update({ where: { code: draft.code }, data })
        : await tx.supplier.create({ data: { code: draft.code, name: data.name!, productName: data.productName, address: data.address, storage: data.storage, shelfLife: data.shelfLife, sourceUrl: draft.sourceUrl, verificationStatus: 'PENDING' } });
      await tx.auditLog.create({ data: { supplierId: supplier.id, action: 'IMPORT_APPROVE', entity: 'SUPPLIER', entityId: draft.code, summary: `Duyệt bản nháp #${id} cho ${draft.code}: ${Object.keys(data).join(', ')}` } });
    });
    return NextResponse.json({ ok: true, code: draft.code, fields: Object.keys(data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không lưu được bản nháp.' }, { status: 409 });
  }
}
