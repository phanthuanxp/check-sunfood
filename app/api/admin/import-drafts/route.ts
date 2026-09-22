import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { fetchSmartCheckDraft } from '@/lib/smartcheck-import';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const drafts = await prisma.importDraft.findMany({ orderBy: { fetchedAt: 'desc' }, take: 150 });
  return NextResponse.json(drafts.map(draft => ({ ...draft, fields: JSON.parse(draft.payload), payload: undefined })));
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  if (!/^NCC-\d{2}$/.test(code)) return NextResponse.json({ error: 'Mã NCC không hợp lệ.' }, { status: 400 });
  const supplier = await prisma.supplier.findUnique({ where: { code } });
  const sourceUrl = supplier?.sourceUrl || String(body.sourceUrl || '').trim();
  if (!sourceUrl) return NextResponse.json({ error: 'Cần URL QR nguồn của NCC mới.' }, { status: 400 });
  try {
    const snapshot = await fetchSmartCheckDraft(sourceUrl);
    const existing = await prisma.importDraft.findFirst({ where: { code, sourceHash: snapshot.sourceHash, status: 'PENDING' }, orderBy: { fetchedAt: 'desc' } });
    if (existing) {
      if (existing.payload !== JSON.stringify(snapshot.fields)) await prisma.importDraft.update({ where: { id: existing.id }, data: { payload: JSON.stringify(snapshot.fields), fetchedAt: new Date() } });
      return NextResponse.json({ id: existing.id, code, fields: snapshot.fields, alreadyPending: true });
    }
    const draft = await prisma.importDraft.create({ data: { code, sourceUrl: snapshot.sourceUrl, sourceHash: snapshot.sourceHash, payload: JSON.stringify(snapshot.fields) } });
    return NextResponse.json({ id: draft.id, code, fields: snapshot.fields }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không đọc được nguồn.' }, { status: 422 });
  }
}
