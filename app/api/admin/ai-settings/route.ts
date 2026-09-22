import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { canEncryptAiKey, encryptAiKey, getAiRuntimeSettings, isAiModel } from '@/lib/ai-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'no-store' };

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await getAiRuntimeSettings();
  return NextResponse.json({
    hasKey: Boolean(settings.apiKey), keySource: settings.keySource, keyError: settings.keyError,
    canEncrypt: settings.canEncrypt, documentModel: settings.documentModel,
    helperModel: settings.helperModel, publicQaEnabled: settings.publicQaEnabled,
    updatedAt: settings.updatedAt,
  }, { headers: privateHeaders });
}

export async function PUT(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => null);
  if (!body || !isAiModel(body.documentModel) || !isAiModel(body.helperModel) || typeof body.publicQaEnabled !== 'boolean')
    return NextResponse.json({ error: 'Cấu hình model không hợp lệ.' }, { status: 400 });
  const incomingKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (incomingKey && (incomingKey.length < 20 || incomingKey.length > 512 || /\s/.test(incomingKey)))
    return NextResponse.json({ error: 'Khóa API không hợp lệ.' }, { status: 400 });
  if (incomingKey && !canEncryptAiKey())
    return NextResponse.json({ error: 'Máy chủ cần AUTH_SECRET hoặc INTEGRATION_ENCRYPTION_KEY ổn định, tối thiểu 32 ký tự, trước khi lưu khóa.' }, { status: 503 });
  const existing = await getAiRuntimeSettings();
  if (body.publicQaEnabled && !incomingKey && !existing.apiKey)
    return NextResponse.json({ error: 'Cần cấu hình khóa AI hợp lệ trước khi bật trợ lý công khai.' }, { status: 400 });
  const data = {
    documentModel: body.documentModel as string,
    helperModel: body.helperModel as string,
    publicQaEnabled: body.publicQaEnabled as boolean,
    ...(incomingKey ? { encryptedApiKey: encryptAiKey(incomingKey) } : {}),
  };
  await prisma.$transaction(async tx => {
    await tx.aiIntegrationSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await tx.auditLog.create({ data: { action: 'UPDATE', entity: 'AI_SETTINGS', summary: `Cập nhật cấu hình AI: hồ sơ ${data.documentModel}, hỗ trợ ${data.helperModel}, hỏi đáp công khai ${data.publicQaEnabled ? 'bật' : 'tắt'}${incomingKey ? ', đã thay khóa' : ''}` } });
  });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  await prisma.$transaction(async tx => {
    await tx.aiIntegrationSettings.upsert({ where: { id: 1 }, create: { id: 1, encryptedApiKey: null, publicQaEnabled: false }, update: { encryptedApiKey: null, publicQaEnabled: false } });
    await tx.auditLog.create({ data: { action: 'UPDATE', entity: 'AI_SETTINGS', summary: 'Xóa khóa AI lưu trong trang quản trị; tắt hỏi đáp công khai' } });
  });
  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
