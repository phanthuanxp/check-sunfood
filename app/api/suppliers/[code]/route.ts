import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { supplierData } from '@/lib/suppliers';
import { rejectUntrustedMutation } from '@/lib/security';

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() }, select: {
    id:true, code:true, name:true, nameEn:true, productName:true, productNameEn:true, address:true, addressEn:true, taxCode:true,
    phone:true, website:true, email:true, description:true, descriptionEn:true, storage:true, storageEn:true, shelfLife:true, shelfLifeEn:true,
    status:true, verificationStatus:true, notes:true, notesEn:true, createdAt:true, updatedAt:true, documents: { where: { isPublic: true } }
  }});
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  return NextResponse.json(supplier);
}

export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const { code } = await params;
  const existing = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() } });
  if (!existing) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  const body = await request.json();
  const nextCode = String(body.code || existing.code).trim().toUpperCase();
  const name = String(body.name || '').trim();
  if (!/^NCC-\d{2}$/.test(nextCode) || !name) return NextResponse.json({ error: 'Mã NCC hoặc tên không hợp lệ.' }, { status: 400 });
  if (nextCode !== existing.code) return NextResponse.json({ error: 'Mã NCC là định danh URL cố định và không thể thay đổi.' }, { status: 400 });
  const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: supplierData(body, nextCode, name) });
  await audit({ supplierId: supplier.id, action: 'UPDATE', entity: 'SUPPLIER', entityId: String(supplier.id), summary: `Cập nhật ${supplier.code} - ${supplier.name}` });
  return NextResponse.json(supplier);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const { code } = await params;
  const existing = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() } });
  if (!existing) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  const number = Number(existing.code.slice(4));
  if (number >= 1 && number <= 23) {
    await prisma.supplier.update({ where: { id: existing.id }, data: { status: 'INACTIVE' } });
    await audit({ supplierId: existing.id, action: 'ARCHIVE', entity: 'SUPPLIER', entityId: String(existing.id), summary: `Tạm ngừng ${existing.code} - ${existing.name}; giữ nguyên URL QR` });
    return NextResponse.json({ ok: true, archived: true });
  }
  await audit({ supplierId: null, action: 'DELETE', entity: 'SUPPLIER', entityId: String(existing.id), summary: `Xóa ${existing.code} - ${existing.name}` });
  await prisma.supplier.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
