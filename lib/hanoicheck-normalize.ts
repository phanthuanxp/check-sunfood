import { createHash } from 'node:crypto';
import { validatedHanoiCheckTraceUrl, type HcTraceDetail } from './hanoicheck-trace';

export const VIETNAM_UTC_OFFSET_HOURS = 7;

export function extractNccCode(value: string): string | null {
  const codes = [...value.matchAll(/(?:^|[-_])ncc[-_]?(\d{1,2})(?=$|[-_])/gi)]
    .map(match => `NCC-${match[1].padStart(2, '0')}`);
  return new Set(codes).size === 1 ? codes[0] : null;
}

export function parseVietnameseDate(value: string | null): Date | null {
  const match = value && /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  if (y < 1900 || y > 2200) return null;
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return new Date(utc.getTime() - VIETNAM_UTC_OFFSET_HOURS * 3600_000);
}

export function vietnamToday(now = new Date()) {
  return new Date(now.getTime() + VIETNAM_UTC_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);
}

export function validateSyncDates(from: string, to: string) {
  const iso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parseVietnameseDate(s.split('-').reverse().join('/'));
  const start = iso(from), end = iso(to);
  if (!start || !end || end < start || end.getTime() - start.getTime() > 30 * 86400_000)
    throw new Error('Khoảng đồng bộ phải có ngày hợp lệ và tối đa 31 ngày.');
}

export function sourceIdentity(url: string, detail?: HcTraceDetail) {
  const sourceUrl = validatedHanoiCheckTraceUrl(url).replace(/\/$/, '');
  const parts = new URL(sourceUrl).pathname.split('/');
  const connection = parts[1], traceCode = parts[parts.length - 1];
  if (detail && detail.traceCode !== traceCode) throw new Error('Mã truy xuất trong trang nguồn không khớp URL.');
  return { sourceUrl, sourceKey: `HANOICHECK:${connection}:${traceCode}` };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function payloadHash(detail: HcTraceDetail) {
  return createHash('sha256').update(JSON.stringify(canonical(detail))).digest('hex');
}

export function sourceSupplierCode(detail: HcTraceDetail) {
  const food = extractNccCode(detail.foodCode || ''), batch = extractNccCode(detail.batchCode || '');
  if (food && batch && food !== batch) throw new Error('Mã NCC trong mã thực phẩm và mã lô không khớp; cần đối chiếu.');
  return food || batch;
}

export function validateSourceDates(detail: HcTraceDetail) {
  for (const field of ['importedAt', 'producedAt', 'expiresAt'] as const) {
    if (detail[field] && !parseVietnameseDate(detail[field])) throw new Error(`Ngày nguồn không hợp lệ: ${field}.`);
  }
  const produced = parseVietnameseDate(detail.producedAt), expires = parseVietnameseDate(detail.expiresAt);
  if (produced && expires && expires < produced) throw new Error('Hạn dùng nguồn trước ngày sản xuất.');
}
