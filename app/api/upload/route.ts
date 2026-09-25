import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { saveUpload } from '@/lib/storage';

const allowed = new Map([
  ['application/pdf', '.pdf'], ['image/jpeg', '.jpg'], ['image/png', '.png']
]);

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected=rejectUntrustedMutation(request); if(rejected)return rejected;
  const data = await request.formData();
  const file = data.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Chưa chọn tệp.' }, { status: 400 });
  const extension = allowed.get(file.type);
  if (!extension) return NextResponse.json({ error: 'Chỉ chấp nhận PDF, JPG hoặc PNG.' }, { status: 415 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'Tệp vượt quá giới hạn 50 MB.' }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validSignature = extension === '.pdf'
    ? String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
    : extension === '.png'
      ? [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!validSignature) return NextResponse.json({ error: 'Nội dung tệp không khớp định dạng PDF/JPG/PNG.' }, { status: 415 });
  const filename = await saveUpload(bytes, extension);
  return NextResponse.json({ fileUrl: `/api/files/${filename}`, originalName: file.name });
}
