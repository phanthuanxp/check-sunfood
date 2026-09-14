'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
    if (!response.ok) { const data = await response.json(); setError(data.error || 'Không thể đăng nhập.'); setLoading(false); return; }
    router.push('/admin'); router.refresh();
  }
  return <form className="auth-form" onSubmit={submit}><label>Tên đăng nhập<input name="username" autoComplete="username" required /></label><label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-btn" disabled={loading}>{loading ? 'Đang đăng nhập…' : 'Đăng nhập'}</button></form>;
}
