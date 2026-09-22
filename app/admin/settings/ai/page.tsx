import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import AiSettingsForm from './AiSettingsForm';
import './settings.css';

export const dynamic = 'force-dynamic';

export default async function AiSettingsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return <AiSettingsForm />;
}
