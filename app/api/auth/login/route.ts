import { NextResponse } from 'next/server';
import { authCookie, createSessionToken } from '@/lib/auth';
import { checkLoginRateLimit, clearLoginAttempts, rejectUntrustedMutation } from '@/lib/security';

export async function POST(request: Request) {
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const clientKey=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'localhost';
  const limit=checkLoginRateLimit(clientKey);
  if(!limit.allowed)return NextResponse.json({error:'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.',retryAfter:limit.retryAfter},{status:429,headers:{'Retry-After':String(limit.retryAfter)}});
  const { username, password } = await request.json().catch(() => ({}));
  if (username !== (process.env.ADMIN_USERNAME || 'admin') || password !== (process.env.ADMIN_PASSWORD || 'change-me-local')) {
    return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, { status: 401 });
  }
  clearLoginAttempts(clientKey);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookie.name, createSessionToken(username), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: authCookie.maxAge
  });
  return response;
}
