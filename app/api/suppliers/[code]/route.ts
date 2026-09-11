import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() }, include: { documents: true } });
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  return NextResponse.json(supplier);
}
