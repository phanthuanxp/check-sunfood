import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PublicSupplier from './PublicSupplier';
import { getAiRuntimeSettings } from '@/lib/ai-settings';

export const dynamic = 'force-dynamic';

export default async function SupplierPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() }, include: { documents: { where: { isPublic: true }, orderBy: { createdAt: 'desc' } }, auditLogs: { where: { entity: 'SUPPLIER', action: { in: ['CREATE', 'UPDATE', 'ARCHIVE'] } }, orderBy: { createdAt: 'desc' }, take: 20 }, products: { where: { isPublic: true }, select: { id: true, name: true, batches: { where: { isPublic: true }, select: { publicId: true, code: true, receivedAt: true, expiresAt: true }, orderBy: { receivedAt: 'desc' } } } } } });
  if (!supplier) notFound();
  const ai = await getAiRuntimeSettings();
  return <PublicSupplier supplier={JSON.parse(JSON.stringify(supplier))} aiEnabled={ai.publicQaEnabled && Boolean(ai.apiKey) && supplier.status === 'ACTIVE' && supplier.verificationStatus === 'VERIFIED'} />;
}
