import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin');
  return <main className="auth-page"><section className="auth-card"><div className="logo-mark">SF</div><p className="eyebrow">SUNFOOD TÂY ĐÔ</p><h1>Quản trị truy xuất</h1><p className="muted">Đăng nhập để quản lý nhà cung cấp và hồ sơ.</p><LoginForm /><Link className="back-link" href="/">← Về trang truy xuất</Link></section></main>;
}
