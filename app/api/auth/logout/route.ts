import { NextResponse } from 'next/server';
import { authCookie } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';

export async function POST(request:Request) {
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookie.name, '', { path: '/', maxAge: 0 });
  return response;
}
