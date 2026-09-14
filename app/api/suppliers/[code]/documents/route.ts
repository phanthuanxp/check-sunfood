import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getExpiryState } from '@/lib/documents';
import { rejectUntrustedMutation } from '@/lib/security';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const { code } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() } });
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  const body = await request.json();
  if (!body.title || !body.fileUrl) return NextResponse.json({ error: 'Thiếu tiêu đề hoặc tệp hồ sơ.' }, { status: 400 });
  const document = await prisma.document.create({ data: {
    supplierId: supplier.id, title: String(body.title).trim(), titleEn: String(body.titleEn || '').trim() || null, category: String(body.category || 'OTHER'), fileUrl: String(body.fileUrl),
    issuedAt: body.issuedAt ? new Date(body.issuedAt) : null, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    status: getExpiryState(body.expiresAt || null), isPublic: Boolean(body.isPublic)
  }});
  await audit({ supplierId: supplier.id, action: 'CREATE', entity: 'DOCUMENT', entityId: String(document.id), summary: `Thêm hồ sơ “${document.title}” cho ${supplier.code}` });
  return NextResponse.json(document, { status: 201 });
}
