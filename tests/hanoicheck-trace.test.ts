import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { extractHanoiCheckTrace, validatedHanoiCheckTraceUrl } from '../lib/hanoicheck-trace';

const html = readFileSync(new URL('./fixtures/hanoicheck-trace-sample.html', import.meta.url), 'utf8');

test('extracts the full batch detail from a real HanoiCheck traceability page', () => {
  const detail = extractHanoiCheckTrace(html);
  assert.equal(detail.verified, true);
  assert.equal(detail.productName, 'Cá diêu hồng phi lê');
  assert.equal(detail.foodCode, 'CADIEUHONGPHILE-NCC07');
  assert.equal(detail.traceCode, 'TP-NCC-2026-000232-20260922-18063');
  assert.equal(detail.supplierName, 'Công Ty Thực Phẩm SunFood Tây Đô');
  assert.equal(detail.batchCode, 'LO-CADIEUHONGPHILE-NCC07-0923-3502');
  assert.equal(detail.batchName, 'Cá diêu hồng phi lê ngày 23/9');
  assert.equal(detail.importedAt, '23/09/2026');
  assert.equal(detail.origin, 'Việt Nam');
  assert.equal(detail.processName, 'QTSX Thủy Sản Nước Ngọt');
  assert.equal(detail.producedAt, '22/09/2026');
  assert.equal(detail.expiresAt, '26/09/2026');
  assert.equal(detail.warehouseName, 'Kho hàng khô - Sunfood Tây Đô');
  // Dash placeholders ("—") on the source page must not become the literal em-dash.
  assert.equal(detail.purchaseAddress, null);
  assert.equal(detail.gtin, null);
  assert.equal(detail.standardFoodCode, null);
  assert.equal(detail.facilityName, null);
  assert.equal(detail.subSupplierName, null);
});

test('extracts the cover image and attachment list', () => {
  const detail = extractHanoiCheckTrace(html);
  assert.match(detail.coverImageUrl ?? '', /^https:\/\/storage\.vietec\.vn\//);
  assert.equal(detail.attachments.length, 1);
  assert.equal(detail.attachments[0].name, 'QR NCC-07');
  assert.match(detail.attachments[0].url, /^https:\/\/storage\.vietec\.vn\//);
});

test('extracts the 3 production steps in order with performer and note', () => {
  const detail = extractHanoiCheckTrace(html);
  assert.equal(detail.steps.length, 3);
  assert.equal(detail.steps[0].title, '1. Nhập hàng');
  assert.equal(detail.steps[0].performedBy, 'Bùi Đức Thắng');
  assert.equal(detail.steps[0].performedByRole, 'Nhân viên kho');
  assert.equal(detail.steps[0].address, null);
  assert.match(detail.steps[0].note ?? '', /nhập hàng đến kho/);
  assert.equal(detail.steps[1].title, '2. Phân loại');
  assert.equal(detail.steps[2].title, '3. Vận chuyển');
});

test('extracts personnel and their certificates', () => {
  const detail = extractHanoiCheckTrace(html);
  assert.equal(detail.employees.length, 3);
  const withCerts = detail.employees.find(e => e.name === 'Nguyễn Thị Hồng');
  assert.equal(withCerts?.position, 'Nhân viên');
  assert.equal(withCerts?.certificates.length, 2);
  assert.match(withCerts?.certificates[0] ?? '', /Giấy khám sức khỏe/);
  assert.match(withCerts?.certificates[1] ?? '', /tập huấn ATTP/);
  const noCerts = detail.employees.find(e => e.name === 'Bùi Đức Thắng');
  assert.equal(noCerts?.certificates.length, 0);
});

test('only accepts real tracuu.hanoicheck.com.vn traceability URLs', () => {
  const url = validatedHanoiCheckTraceUrl('https://tracuu.hanoicheck.com.vn/NCC-2026-000232/truy-xuat/san-pham/TP-NCC-2026-000232-20260922-18063');
  assert.equal(url, 'https://tracuu.hanoicheck.com.vn/NCC-2026-000232/truy-xuat/san-pham/TP-NCC-2026-000232-20260922-18063');
  assert.throws(() => validatedHanoiCheckTraceUrl('https://evil.example.com/NCC-2026-000232/truy-xuat/san-pham/TP-1'));
  assert.throws(() => validatedHanoiCheckTraceUrl('http://tracuu.hanoicheck.com.vn/NCC-2026-000232/truy-xuat/san-pham/TP-1'));
  assert.throws(() => validatedHanoiCheckTraceUrl('https://tracuu.hanoicheck.com.vn/other/path'));
});
