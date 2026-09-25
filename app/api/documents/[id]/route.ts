import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getExpiryState } from '@/lib/documents';
import { rejectUntrustedMutation } from '@/lib/security';
import { isExternalDocUrl, normalizeExternalDocUrl } from '@/lib/external-doc-link';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const { id } = await params;
  const documentId = Number(id);
  const existing = await prisma.document.findUnique({ where: { id: documentId }, include: { supplier: true } });
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const body = await request.json();
  const rawFileUrl = String(body.fileUrl || existing.fileUrl);
  const fileUrl = isExternalDocUrl(rawFileUrl) ? normalizeExternalDocUrl(rawFileUrl) : rawFileUrl;
  if (!fileUrl) return NextResponse.json({ error: 'Link không hợp lệ. Dùng link chia sẻ Google Drive ở chế độ công khai.' }, { status: 400 });
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  const document = await prisma.$transaction(async tx => {
    if (fileUrl !== existing.fileUrl) await tx.documentVersion.create({ data: { documentId, fileUrl: existing.fileUrl, note: 'Phiên bản trước khi thay tệp' } });
    return tx.document.update({ where: { id: documentId }, data: {
      title: String(body.title || existing.title).trim(), titleEn: String(body.titleEn || '').trim() || null, category: String(body.category || existing.category), fileUrl,
      issuedAt: body.issuedAt ? new Date(body.issuedAt) : null, expiresAt,
      status: getExpiryState(expiresAt), isPublic: Boolean(body.isPublic)
    }});
  });
  await audit({ supplierId: existing.supplierId, action: 'UPDATE', entity: 'DOCUMENT', entityId: id, summary: `Cập nhật hồ sơ “${document.title}” của ${existing.supplier.code}` });
  return NextResponse.json(document);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const { id } = await params;
  const existing = await prisma.document.findUnique({ where: { id: Number(id) }, include: { supplier: true } });
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  await prisma.document.delete({ where: { id: existing.id } });
  await audit({ supplierId: existing.supplierId, action: 'DELETE', entity: 'DOCUMENT', entityId: id, summary: `Xóa hồ sơ “${existing.title}” của ${existing.supplier.code}` });
  return NextResponse.json({ ok: true });
}
