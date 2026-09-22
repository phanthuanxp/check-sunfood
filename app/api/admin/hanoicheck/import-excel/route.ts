import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { parseFirstSheet, sheetToRecords } from '@/lib/xlsx-parse';
import { syncBatchesFromExcelRecords } from '@/lib/hanoicheck-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip',
]);

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Chưa chọn tệp Excel.' }, { status: 400 });
  if (!file.name.toLowerCase().endsWith('.xlsx') || !XLSX_MIME_TYPES.has(file.type || 'application/octet-stream'))
    return NextResponse.json({ error: 'Chỉ chấp nhận tệp .xlsx.' }, { status: 415 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Tệp vượt quá giới hạn 10 MB.' }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return NextResponse.json({ error: 'Nội dung tệp không phải định dạng .xlsx hợp lệ.' }, { status: 415 });

  let records: Record<string, string>[];
  try {
    records = sheetToRecords(await parseFirstSheet(buffer));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không đọc được nội dung file Excel.' }, { status: 422 });
  }
  if (!records.length) return NextResponse.json({ error: 'File không có dòng dữ liệu nào.' }, { status: 422 });
  if (!Object.keys(records[0]).some(key => /link truy xuất/i.test(key)))
    return NextResponse.json({ error: 'File thiếu cột "Link truy xuất". Xuất đúng báo cáo QL lô nhập hàng từ cổng HanoiCheck.' }, { status: 422 });
  if (records.length > 500) return NextResponse.json({ error: 'Tối đa 500 dòng mỗi lần nhập; chia nhỏ file và thử lại.' }, { status: 422 });

  const result = await syncBatchesFromExcelRecords(records);
  await prisma.auditLog.create({ data: { action: 'SYNC', entity: 'HANOICHECK_BATCHES', summary: `Nhập lô từ file Excel "${file.name}": ${result.processed} dòng, ${result.created} mới, ${result.updated} cập nhật, ${result.skipped.length} bỏ qua` } });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
