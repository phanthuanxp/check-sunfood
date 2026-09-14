import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PublicSupplier from './PublicSupplier';

export const dynamic = 'force-dynamic';

export default async function SupplierPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() }, include: { documents: { where: { isPublic: true }, orderBy: { createdAt: 'desc' } }, auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 } } });
  if (!supplier) notFound();
  return <PublicSupplier supplier={JSON.parse(JSON.stringify(supplier))} />;
}
