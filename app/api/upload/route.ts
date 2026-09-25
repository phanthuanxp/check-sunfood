import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { saveUpload } from '@/lib/storage';

// Phone camera photos routinely arrive at 4000px+/several MB; re-encoding caps the dimensions
// and file size for web display while staying visually lossless for document/label reading.
// PNG stays lossless (only resized) so supplier logo transparency isn't degraded.
async function compressImage(bytes: Uint8Array, extension: '.jpg' | '.png') {
  const image = sharp(bytes).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true });
  return extension === '.jpg'
    ? image.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
    : image.png({ compressionLevel: 9 }).toBuffer();
}

const allowed = new Map<string, '.pdf' | '.jpg' | '.png'>([
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
  // Some sources (e.g. pre-optimized graphics) already beat sharp's re-encode, especially for
  // PNG, which is lossless — only keep the compressed version when it's actually smaller.
  const compressed = extension === '.pdf' ? null : await compressImage(bytes, extension).catch(() => null);
  const toStore = compressed && compressed.length < bytes.length ? compressed : bytes;
  const filename = await saveUpload(toStore, extension);
  return NextResponse.json({ fileUrl: `/api/files/${filename}`, originalName: file.name });
}
