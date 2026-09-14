import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import AdminDashboard from './AdminDashboard';

export default async function AdminPage({ searchParams }:{ searchParams:Promise<{view?:string}> }) {
  if (!(await isAdmin())) redirect('/admin/login');
  const {view}=await searchParams;
  const initialView=(['overview','suppliers','qr','audit'].includes(view||'')?view:'overview') as 'overview'|'suppliers'|'qr'|'audit';
  const [suppliers, auditLogs] = await Promise.all([
    prisma.supplier.findMany({ include: { documents: { include: { versions: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } } }, orderBy: { code: 'asc' } }),
    prisma.auditLog.findMany({ take: 20, orderBy: { createdAt: 'desc' } })
  ]);
  return <AdminDashboard initialView={initialView} initialSuppliers={JSON.parse(JSON.stringify(suppliers))} auditLogs={JSON.parse(JSON.stringify(auditLogs))} />;
}
