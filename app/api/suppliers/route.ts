import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { supplierData } from '@/lib/suppliers';
import { rejectUntrustedMutation } from '@/lib/security';

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = new URL(request.url).searchParams.get('q')?.trim() || '';
  const suppliers = await prisma.supplier.findMany({
    where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { productName: { contains: q } }] } : undefined,
    include: { documents: true }, orderBy: { code: 'asc' }
  });
  return NextResponse.json(suppliers);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const body = await request.json();
  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  if (!/^NCC-\d{2}$/.test(code) || !name) return NextResponse.json({ error: 'Mã NCC hoặc tên không hợp lệ.' }, { status: 400 });
  try {
    const supplier = await prisma.supplier.create({ data: supplierData(body, code, name) });
    await audit({ supplierId: supplier.id, action: 'CREATE', entity: 'SUPPLIER', entityId: String(supplier.id), summary: `Tạo ${code} - ${name}` });
    return NextResponse.json(supplier, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Mã NCC đã tồn tại hoặc dữ liệu không hợp lệ.' }, { status: 409 });
  }
}
