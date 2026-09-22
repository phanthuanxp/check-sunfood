import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import TraceWorkspace from './TraceWorkspace';
import '../import/import.css';
import './trace.css';

export const dynamic = 'force-dynamic';

export default async function TracePage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const suppliers = await prisma.supplier.findMany({ select: { id: true, code: true, name: true, status: true, verificationStatus: true, products: { include: { batches: { include: { events: { orderBy: { occurredAt: 'asc' } } }, orderBy: { id: 'desc' } } }, orderBy: { id: 'desc' } } }, orderBy: { code: 'asc' } });
  return <TraceWorkspace suppliers={JSON.parse(JSON.stringify(suppliers))} />;
}
