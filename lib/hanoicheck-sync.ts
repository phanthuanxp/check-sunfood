import { listOrders, getOrder } from './hanoicheck';
import { getHanoiCheckCredentials } from './hanoicheck-settings';
import { fetchHanoiCheckTracePage } from './hanoicheck-trace';
import { stageHanoiCheckBatch } from './hanoicheck-import-store';
import { validateSyncDates } from './hanoicheck-normalize';

export { extractNccCode, parseVietnameseDate, VIETNAM_UTC_OFFSET_HOURS } from './hanoicheck-normalize';
export type { BatchSyncOutcome } from './hanoicheck-import-store';
export const MAX_SYNC_ITEMS = 500;
const MAX_ORDER_PAGES = 10;
const MAX_ORDERS = 1000;
export type BulkSyncResult = { processed: number; created: number; updated: number; pending: number; unchanged: number; skipped: { code: string; reason: string }[] };
type Progress = (result: BulkSyncResult) => Promise<void>;
const emptyResult = (): BulkSyncResult => ({ processed: 0, created: 0, updated: 0, pending: 0, unchanged: 0, skipped: [] });

export async function syncBatchFromTraceUrl(traceUrl: string) {
  const { sourceUrl, detail, html } = await fetchHanoiCheckTracePage(traceUrl);
  return stageHanoiCheckBatch(sourceUrl, detail, html);
}

export async function syncBatchesFromExcelRecords(records: Record<string, string>[], onProgress?: Progress): Promise<BulkSyncResult> {
  if (records.length > MAX_SYNC_ITEMS) throw new Error('Tối đa 500 lô mỗi lần đồng bộ.');
  const result = emptyResult();
  const linkKey = Object.keys(records[0] ?? {}).find(key => /link truy xuất/i.test(key)) ?? 'Link truy xuất';
  const codeKey = Object.keys(records[0] ?? {}).find(key => /^mã lô$/i.test(key)) ?? 'Mã lô';
  for (const [index, record] of records.entries()) {
    await onProgress?.(result);
    if (!record[linkKey]) { result.skipped.push({ code: record[codeKey] || `Dòng ${index + 2}`, reason: 'Thiếu Link truy xuất.' }); continue; }
    await importOne(record[linkKey], record[codeKey] || `Dòng ${index + 2}`, result);
    await onProgress?.(result);
  }
  return result;
}

async function importOne(url: string, label: string, result: BulkSyncResult) {
  result.processed++;
  try {
    const outcome = await syncBatchFromTraceUrl(url);
    if (outcome.action === 'created') result.created++;
    else if (outcome.action === 'pending') result.pending++;
    else result.unchanged++;
  } catch (error) {
    result.skipped.push({ code: label, reason: error instanceof Error ? error.message.slice(0, 300) : 'Không tiếp nhận được lô.' });
  }
}

// Read-only discovery through the documented order API; other vendor endpoints may exist.
export async function syncBatchesFromOrders(dateFrom: string, dateTo: string, onProgress?: Progress): Promise<BulkSyncResult> {
  validateSyncDates(dateFrom, dateTo);
  const credentials = await getHanoiCheckCredentials();
  if (!credentials) throw new Error('Chưa cấu hình đầy đủ kết nối HanoiCheck.');
  const result = emptyResult(), traces = new Set<string>(), ordersSeen = new Set<string>();
  for (let page = 1; page <= MAX_ORDER_PAGES; page++) {
    await onProgress?.(result);
    const response = await listOrders({ order_date_from: dateFrom, order_date_to: dateTo, page, per_page: 100 });
    if (!Array.isArray(response.data)) throw new Error('HanoiCheck trả danh sách đơn hàng không đúng cấu trúc.');
    if (response.data.length > 100) throw new Error('Trang đơn hàng vượt giới hạn; chia nhỏ khoảng ngày.');
    if (!response.data.length) return result;
    for (const summary of response.data) {
      if (ordersSeen.has(summary.code)) continue;
      ordersSeen.add(summary.code);
      if (ordersSeen.size > MAX_ORDERS) throw new Error('Vượt giới hạn đơn hàng; chia nhỏ khoảng ngày.');
      await onProgress?.(result);
      let order;
      try { order = (await getOrder(summary.code)).data; }
      catch { result.skipped.push({ code: summary.code, reason: 'Không đọc được chi tiết đơn hàng.' }); continue; }
      if (!order || (order.items && !Array.isArray(order.items))) throw new Error('Chi tiết đơn hàng không đúng cấu trúc.');
      for (const item of order.items ?? []) {
        const trace = item.trace_code;
        if (!trace || traces.has(trace)) continue;
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(trace)) { result.skipped.push({ code: summary.code, reason: 'Mã truy xuất không hợp lệ.' }); continue; }
        if (traces.size >= MAX_SYNC_ITEMS) throw new Error('Vượt giới hạn 500 lô; chia nhỏ khoảng ngày.');
        traces.add(trace);
        await importOne(`https://tracuu.hanoicheck.com.vn/${credentials.traceConnectionCode}/truy-xuat/san-pham/${trace}`, trace, result);
        await onProgress?.(result);
      }
    }
    const lastPage = response.pagination?.last_page;
    if (lastPage && page >= lastPage) return result;
    if (!lastPage && response.data.length < 100) return result;
    if (page === MAX_ORDER_PAGES) throw new Error('Đã đạt giới hạn 10 trang; chia nhỏ khoảng ngày để không bỏ sót lô.');
  }
  return result;
}
