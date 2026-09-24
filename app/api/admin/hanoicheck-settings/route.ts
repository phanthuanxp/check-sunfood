import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { canEncryptHanoiCheckSecret, encryptHanoiCheckSecret, getHanoiCheckStatus, shouldInvalidateHanoiCheckTokens } from '@/lib/hanoicheck-settings';
import { normalizeHanoiCheckEndpoint } from '@/lib/hanoicheck-endpoint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'no-store' };

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getHanoiCheckStatus(), { headers: privateHeaders });
}

const trimmed = (value: unknown, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function PUT(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  for (const [key, limit] of Object.entries({ baseUrl: 200, traceConnectionCode: 100, clientId: 500, clientSecret: 500, hmacSecret: 500 })) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].trim().length > limit)) {
      return NextResponse.json({ error: 'Thông tin kết nối không hợp lệ hoặc vượt giới hạn độ dài.' }, { status: 400 });
    }
  }

  let baseUrl = trimmed(body.baseUrl, 200);
  const traceConnectionCode = trimmed(body.traceConnectionCode, 100);
  const clientId = trimmed(body.clientId, 500);
  const clientSecret = trimmed(body.clientSecret, 500);
  const hmacSecret = trimmed(body.hmacSecret, 500);

  if (baseUrl) {
    try { baseUrl = normalizeHanoiCheckEndpoint(baseUrl); }
    catch { return NextResponse.json({ error: 'Endpoint phải là HTTPS của HanoiCheck đã được máy chủ cho phép, không kèm cổng hoặc đường dẫn.' }, { status: 400 }); }
  }
  if (traceConnectionCode && !/^[A-Za-z0-9_-]{1,100}$/.test(traceConnectionCode))
    return NextResponse.json({ error: 'Mã kết nối công khai chỉ được chứa chữ, số, gạch dưới/gạch ngang.' }, { status: 400 });
  if ((clientId || clientSecret || hmacSecret) && !canEncryptHanoiCheckSecret())
    return NextResponse.json({ error: 'Máy chủ cần AUTH_SECRET hoặc INTEGRATION_ENCRYPTION_KEY ổn định, tối thiểu 32 ký tự, trước khi lưu thông tin kết nối.' }, { status: 503 });

  const data: Record<string, string> = {};
  if (baseUrl) data.baseUrl = baseUrl;
  if (traceConnectionCode) data.traceConnectionCode = traceConnectionCode;
  if (clientId) data.encryptedClientId = encryptHanoiCheckSecret(clientId);
  if (clientSecret) data.encryptedClientSecret = encryptHanoiCheckSecret(clientSecret);
  if (hmacSecret) data.encryptedHmacSecret = encryptHanoiCheckSecret(hmacSecret);
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Không có thay đổi để lưu.' }, { status: 400 });

  await prisma.$transaction(async tx => {
    const current = await tx.hanoiCheckIntegrationSettings.findUnique({ where: { id: 1 } });
    const resetTokens = shouldInvalidateHanoiCheckTokens(current, { baseUrl, traceConnectionCode, clientId, clientSecret, hmacSecret });
    await tx.hanoiCheckIntegrationSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: { ...data, ...(resetTokens ? { encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null } : {}) },
    });
    await tx.auditLog.create({ data: { action: 'UPDATE', entity: 'HANOICHECK_SETTINGS', summary: `Cập nhật cấu hình HanoiCheck${clientId ? ', đã thay Client ID' : ''}${clientSecret ? ', đã thay Client Secret' : ''}${hmacSecret ? ', đã thay HMAC Secret' : ''}` } });
  });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  await prisma.$transaction(async tx => {
    await tx.hanoiCheckIntegrationSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { encryptedClientId: null, encryptedClientSecret: null, encryptedHmacSecret: null, encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null },
    });
    await tx.auditLog.create({ data: { action: 'UPDATE', entity: 'HANOICHECK_SETTINGS', summary: 'Xóa thông tin kết nối HanoiCheck lưu trong trang quản trị' } });
  });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
