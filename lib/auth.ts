import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'sunfood_admin';
const ONE_DAY = 60 * 60 * 24;

function secret() {
  return process.env.AUTH_SECRET || 'local-development-only';
}

function sign(value: string) {
  // Changing the admin password must also invalidate previously issued sessions.
  const signingKey = createHmac('sha256', secret()).update(process.env.ADMIN_PASSWORD || 'change-me-local').digest();
  return createHmac('sha256', signingKey).update(value).digest('base64url');
}

export function createSessionToken(username: string) {
  const payload = Buffer.from(JSON.stringify({ username, exp: Math.floor(Date.now() / 1000) + ONE_DAY })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null) {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
    return Boolean(data.exp && data.exp > Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

export async function isAdmin() {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

export const authCookie = { name: COOKIE_NAME, maxAge: ONE_DAY };
