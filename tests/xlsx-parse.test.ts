import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseFirstSheet, sheetToRecords } from '../lib/xlsx-parse';

const fixturePath = new URL('./fixtures/hanoicheck-batches-sample.xlsx', import.meta.url);

test('parses the header row and real row count from a real HanoiCheck batch export', async () => {
  const rows = await parseFirstSheet(await readFile(fixturePath));
  assert.equal(rows.length, 155);
  assert.deepEqual(rows[0], ['STT', 'Mã lô', 'Tên lô', 'Thực phẩm', 'Mã thực phẩm', 'Nguồn gốc nhà cung cấp', 'Ngày nhập', 'Ngày SX', 'Ngày HH', 'Nhà cung cấp', 'Kho hàng', 'Quy trình SX', 'Mã truy xuất', 'Link truy xuất']);
});

test('keeps columns aligned even when a row has an empty trailing cell (sparse XML)', async () => {
  const rows = await parseFirstSheet(await readFile(fixturePath));
  const header = rows[0];
  const first = rows[1];
  assert.equal(first.length, header.length);
  assert.equal(first[header.indexOf('Ngày HH')], '');
  assert.equal(first[header.indexOf('Mã lô')], 'LO-BANHBAOXAXIU40G-NCC19-0923');
  assert.match(first[header.indexOf('Link truy xuất')], /^https:\/\/tracuu\.hanoicheck\.com\.vn\//);
});

test('sheetToRecords turns rows into header-keyed objects and drops blank rows', async () => {
  const rows = await parseFirstSheet(await readFile(fixturePath));
  const records = sheetToRecords(rows);
  assert.equal(records.length, 154);
  assert.equal(records[0]['Mã lô'], 'LO-BANHBAOXAXIU40G-NCC19-0923');
  assert.equal(records[0]['Mã truy xuất'], 'TP-NCC-2026-000232-20260922-18045');
  assert.ok(records.every(record => record['Link truy xuất']?.startsWith('https://tracuu.hanoicheck.com.vn/')));
});
