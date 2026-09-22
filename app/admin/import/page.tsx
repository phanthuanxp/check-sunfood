import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ImportWorkspace from './ImportWorkspace';
import './import.css';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const [suppliers, drafts] = await Promise.all([
    prisma.supplier.findMany({ select: { code: true, name: true, productName: true, address: true, taxCode: true, storage: true, shelfLife: true, sourceUrl: true }, orderBy: { code: 'asc' } }),
    prisma.importDraft.findMany({ orderBy: { fetchedAt: 'desc' }, take: 150 })
  ]);
  return <ImportWorkspace suppliers={suppliers} initialDrafts={drafts.map(draft => ({ ...draft, fields: JSON.parse(draft.payload), payload: undefined, fetchedAt: draft.fetchedAt.toISOString() }))} />;
}
