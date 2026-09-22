import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { getAiRuntimeSettings } from '@/lib/ai-settings';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const { apiKey, documentModel, helperModel } = await getAiRuntimeSettings();
  if (!apiKey) return NextResponse.json({ error: 'Chưa có khóa AI dùng được.' }, { status: 503 });
  try {
    const models = [...new Set([documentModel, helperModel])];
    for (const model of models) {
      const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
        headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return NextResponse.json({ error: `Không thể truy cập model ${model} (HTTP ${response.status}). Kiểm tra khóa, quyền dự án và model.` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, models }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Không kết nối được tới OpenAI. Kiểm tra mạng máy chủ.' }, { status: 502 });
  }
}
