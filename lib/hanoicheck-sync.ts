import { prisma } from '@/lib/prisma';
import { listOrders, getOrder } from '@/lib/hanoicheck';
import { getHanoiCheckCredentials } from '@/lib/hanoicheck-settings';
import { fetchHanoiCheckTracePage, type HcTraceDetail } from '@/lib/hanoicheck-trace';

export function extractNccCode(foodCode: string): string | null {
  const match = /ncc[-_]?(\d{1,2})(?:\d{3,}|[-_]|$)/i.exec(foodCode);
  if (!match) return null;
  return `NCC-${match[1].padStart(2, '0')}`;
}

// HanoiCheck dates are Vietnam-local (UTC+7). Parsing them as UTC midnight would put
// "today" a few hours in the future relative to the server's current UTC instant for
// most of the Vietnamese day, which then fails the "not a future date" publish check.
export const VIETNAM_UTC_OFFSET_HOURS = 7;

export function parseVietnameseDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), -VIETNAM_UTC_OFFSET_HOURS));
  return Number.isNaN(date.getTime()) ? null : date;
}

export type BatchSyncOutcome = { batchCode: string; publicId: string; action: 'created' | 'updated' };

async function upsertSupplierBatch(nccCode: string, batchCode: string, foodCode: string, foodName: string | null, detail: HcTraceDetail, traceUrl: string): Promise<BatchSyncOutcome> {
  const supplier = await prisma.supplier.findUnique({ where: { code: nccCode } });
  if (!supplier) throw new Error(`Chưa có hồ sơ nhà cung cấp ${nccCode} trong hệ thống. Tạo NCC này trước khi đồng bộ lô.`);

  const product = await prisma.product.upsert({
    where: { supplierId_sku: { supplierId: supplier.id, sku: foodCode } },
    create: { supplierId: supplier.id, name: detail.productName || foodName || foodCode, sku: foodCode, origin: detail.origin, isPublic: false },
    update: { name: detail.productName || foodName || foodCode, origin: detail.origin },
  });

  const existing = await prisma.batch.findUnique({ where: { sourceKey: batchCode } });
  const batchData = {
    name: detail.batchName,
    receivedAt: parseVietnameseDate(detail.importedAt),
    producedAt: parseVietnameseDate(detail.producedAt),
    expiresAt: parseVietnameseDate(detail.expiresAt),
    sourceSyncedAt: new Date(),
    sourceTraceUrl: traceUrl,
    sourcePayload: JSON.stringify(detail),
  };
  const batch = await prisma.batch.upsert({
    where: { sourceKey: batchCode },
    create: { productId: product.id, code: batchCode, sourceSystem: 'HANOICHECK', sourceKey: batchCode, ...batchData },
    update: batchData,
  });

  await prisma.traceEvent.deleteMany({ where: { batchId: batch.id } });
  if (detail.steps.length) {
    const occurredAt = parseVietnameseDate(detail.importedAt) ?? new Date();
    await prisma.traceEvent.createMany({
      data: detail.steps.map(step => ({
        batchId: batch.id,
        occurredAt,
        stage: step.title || `Khâu ${step.index}`,
        title: step.title || `Khâu ${step.index}`,
        details: [step.performedBy ? `Người thực hiện: ${step.performedBy}${step.performedByRole ? ` (${step.performedByRole})` : ''}` : null, step.note].filter(Boolean).join(' · ') || null,
        location: step.address,
        isPublic: false,
      })),
    });
  }

  return { batchCode, publicId: batch.publicId, action: existing ? 'updated' : 'created' };
}

export async function syncBatchFromTraceUrl(traceUrl: string): Promise<BatchSyncOutcome> {
  const { sourceUrl, detail } = await fetchHanoiCheckTracePage(traceUrl);
  if (!detail.batchCode) throw new Error('Không đọc được mã lô từ trang truy xuất.');
  const foodCode = detail.foodCode || '';
  // The NCC suffix normally lives on the food code (e.g. "BIXANH-NCC04"), but a
  // handful of products are coded without it; the batch code itself always carries it.
  const nccCode = extractNccCode(foodCode) || extractNccCode(detail.batchCode);
  if (!nccCode) throw new Error(`Không nhận diện được mã NCC từ mã thực phẩm "${foodCode || '—'}" hoặc mã lô "${detail.batchCode}".`);
  return upsertSupplierBatch(nccCode, detail.batchCode, foodCode, detail.productName, detail, sourceUrl);
}

export type BulkSyncResult = {
  processed: number;
  created: number;
  updated: number;
  skipped: { code: string; reason: string }[];
};

// Daily batch exports downloaded manually from the HanoiCheck NCC portal ("Xuất Excel"
// on the QL lô nhập hàng screen) already carry a "Link truy xuất" per row, so this path
// needs no API credentials at all — it reuses the same public-page sync as a single URL
// import, just driven by the spreadsheet instead of one paste.
export async function syncBatchesFromExcelRecords(records: Record<string, string>[]): Promise<BulkSyncResult> {
  const linkKey = Object.keys(records[0] ?? {}).find(key => /link truy xuất/i.test(key)) ?? 'Link truy xuất';
  const codeKey = Object.keys(records[0] ?? {}).find(key => /^mã lô$/i.test(key)) ?? 'Mã lô';
  const skipped: BulkSyncResult['skipped'] = [];
  let created = 0, updated = 0, processed = 0;
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= records.length) return;
      const record = records[index];
      const traceUrl = record[linkKey];
      const rowLabel = record[codeKey] || `dòng ${index + 2}`;
      if (!traceUrl) { skipped.push({ code: rowLabel, reason: 'Thiếu cột Link truy xuất.' }); continue; }
      processed++;
      try {
        const outcome = await syncBatchFromTraceUrl(traceUrl);
        if (outcome.action === 'created') created++; else updated++;
      } catch (error) {
        skipped.push({ code: rowLabel, reason: error instanceof Error ? error.message : 'Lỗi không xác định.' });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, records.length) }, worker));
  return { processed, created, updated, skipped };
}

// HanoiCheck's supplier API v2.2 has no direct "list batches" service; the only read
// services are orders. Each order line's trace_code is the same code the public
// traceability page (and the batch itself) is keyed by, so batches for a delivery
// date range are discovered by walking that day's orders instead.
export async function syncBatchesFromOrders(dateFrom: string, dateTo: string): Promise<BulkSyncResult> {
  const credentials = await getHanoiCheckCredentials();
  if (!credentials) throw new Error('Chưa cấu hình đầy đủ kết nối HanoiCheck trong Cài đặt.');
  const skipped: BulkSyncResult['skipped'] = [];
  const traceCodesSeen = new Set<string>();
  let created = 0, updated = 0, processed = 0;
  for (let page = 1; ; page++) {
    const { data: orders, pagination } = await listOrders({ order_date_from: dateFrom, order_date_to: dateTo, page, per_page: 100 });
    if (!orders.length) break;
    for (const orderSummary of orders) {
      let orderDetail;
      try {
        orderDetail = (await getOrder(orderSummary.code)).data;
      } catch (error) {
        skipped.push({ code: orderSummary.code, reason: error instanceof Error ? error.message : 'Không đọc được chi tiết đơn hàng.' });
        continue;
      }
      for (const item of orderDetail.items ?? []) {
        const traceCode = item.trace_code;
        if (!traceCode || traceCodesSeen.has(traceCode)) continue;
        traceCodesSeen.add(traceCode);
        processed++;
        try {
          const traceUrl = `https://tracuu.hanoicheck.com.vn/${credentials.traceConnectionCode}/truy-xuat/san-pham/${encodeURIComponent(traceCode)}`;
          const outcome = await syncBatchFromTraceUrl(traceUrl);
          if (outcome.action === 'created') created++; else updated++;
        } catch (error) {
          skipped.push({ code: traceCode, reason: error instanceof Error ? error.message : 'Lỗi không xác định.' });
        }
      }
    }
    if (!pagination?.last_page || page >= pagination.last_page) break;
  }
  return { processed, created, updated, skipped };
}
