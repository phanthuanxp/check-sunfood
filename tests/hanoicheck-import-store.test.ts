import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';
import { stageHanoiCheckBatch, reviewHanoiCheckSnapshot } from '../lib/hanoicheck-import-store';
import {
  parseVietnameseDate,
  payloadHash,
  sourceSupplierCode,
  validateSourceDates,
  validateSyncDates,
} from '../lib/hanoicheck-normalize';
import type { HcTraceDetail } from '../lib/hanoicheck-trace';
import { migratePhase12 } from '../scripts/migrate-phase12';

const legacySql = readFileSync(new URL('./fixtures/phase12-legacy.sql', import.meta.url), 'utf8');

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'sunfood-import-store-'));
  const databasePath = join(directory, 'test.db');
  const backupPath = join(directory, 'before.db');
  const sqlite = new Database(databasePath);
  sqlite.exec(legacySql);
  sqlite.close();
  await migratePhase12({ databasePath, backupPath, apply: true });
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
  t.after(async () => {
    await db.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  });
  const supplier1 = await db.supplier.create({ data: { code: 'NCC-01', name: 'Nhà cung cấp 1', verificationStatus: 'VERIFIED' } });
  const supplier2 = await db.supplier.create({ data: { code: 'NCC-02', name: 'Nhà cung cấp 2', verificationStatus: 'VERIFIED' } });
  await db.hanoiCheckSupplierMapping.create({ data: { externalCode: 'NCC-01', supplierId: supplier1.id } });
  return { db, supplier1, supplier2 };
}

const traceCode = 'TP-NCC-2026-000232-20260922-18063';
const traceUrl = (connection = 'NCC-2026-000232', code = traceCode) =>
  `https://tracuu.hanoicheck.com.vn/${connection}/truy-xuat/san-pham/${code}`;

function detail(changes: Partial<HcTraceDetail> = {}): HcTraceDetail {
  return {
    verified: true,
    productName: 'Cá diêu hồng phi lê',
    foodCode: 'CADIEUHONGPHILE-NCC01',
    traceCode,
    supplierName: 'Nhà cung cấp nguồn',
    category: 'Thủy sản',
    batchName: 'Tên lô từ nguồn',
    batchCode: 'LO-CADIEUHONGPHILE-NCC01-001',
    importedAt: '23/09/2026',
    origin: 'Việt Nam',
    purchaseAddress: null,
    gtin: null,
    standardFoodCode: null,
    processName: 'Quy trình nguồn',
    producedAt: '22/09/2026',
    expiresAt: '26/09/2026',
    warehouseName: 'Kho nguồn',
    facilityName: null,
    subSupplierName: null,
    coverImageUrl: null,
    attachments: [],
    steps: [],
    employees: [],
    footerNote: null,
    ...changes,
  };
}

async function approvedBatch(t: TestContext) {
  const data = await fixture(t);
  const source = detail();
  const staged = await stageHanoiCheckBatch(traceUrl(), source, '<html>first</html>', data.db);
  await reviewHanoiCheckSnapshot(staged.snapshotId, payloadHash(source), 'approve', [], data.db);
  const batch = await data.db.batch.findUniqueOrThrow({ where: { sourceKey: `HANOICHECK:NCC-2026-000232:${traceCode}` } });
  return { ...data, source, staged, batch };
}

test('replaying an identical source preserves the permanent QR, publication flags, events, and curated fields', async (t) => {
  const { db, source, batch } = await approvedBatch(t);
  await db.product.update({ where: { id: batch.productId }, data: { name: 'Tên sản phẩm Sunfood đã duyệt', origin: 'Xuất xứ đã đối chiếu', isPublic: true } });
  const localReceivedAt = new Date('2026-09-20T17:00:00.000Z');
  await db.batch.update({
    where: { id: batch.id },
    data: { name: 'Tên lô Sunfood đã chỉnh', receivedAt: localReceivedAt, isPublic: true, everPublished: true },
  });
  const event = await db.traceEvent.create({
    data: { batchId: batch.id, occurredAt: new Date('2026-09-22T02:00:00.000Z'), stage: 'RECEIPT', title: 'Sự kiện Sunfood', details: 'Giữ nguyên nội dung', isPublic: true },
  });
  const before = await db.batch.findUniqueOrThrow({ where: { id: batch.id }, include: { product: true, events: true } });

  const replay = await stageHanoiCheckBatch(traceUrl(), source, '<html>same parsed payload</html>', db);
  const after = await db.batch.findUniqueOrThrow({ where: { id: batch.id }, include: { product: true, events: true } });

  assert.equal(replay.action, 'unchanged');
  assert.equal(replay.publicId, before.publicId);
  assert.equal(after.publicId, before.publicId);
  assert.equal(after.isPublic, true);
  assert.equal(after.everPublished, true);
  assert.equal(after.name, 'Tên lô Sunfood đã chỉnh');
  assert.equal(after.receivedAt?.toISOString(), localReceivedAt.toISOString());
  assert.equal(after.product.name, 'Tên sản phẩm Sunfood đã duyệt');
  assert.equal(after.product.origin, 'Xuất xứ đã đối chiếu');
  assert.equal(after.events.length, 1);
  assert.equal(after.events[0].id, event.id);
  assert.equal(after.events[0].title, 'Sự kiện Sunfood');
  assert.equal(after.events[0].isPublic, true);
});

test('a changed payload remains pending, cannot approve a stale snapshot/hash, and only applies selected fields', async (t) => {
  const { db, batch } = await approvedBatch(t);
  await db.batch.update({ where: { id: batch.id }, data: { name: 'Tên nội bộ', receivedAt: new Date('2026-09-18T17:00:00.000Z'), isPublic: true, everPublished: true } });
  const accepted = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });
  const second = detail({ batchName: 'Tên nguồn lần hai', importedAt: '24/09/2026' });
  const stagedSecond = await stageHanoiCheckBatch(traceUrl(), second, '<html>second</html>', db);
  const pending = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });

  assert.equal(stagedSecond.action, 'pending');
  assert.equal(pending.name, 'Tên nội bộ');
  assert.equal(pending.receivedAt?.toISOString(), '2026-09-18T17:00:00.000Z');
  assert.equal(pending.sourcePayloadHash, accepted.sourcePayloadHash);
  assert.equal(pending.sourceReviewStatus, 'APPROVED');
  assert.equal(pending.isPublic, true);

  const third = detail({ batchName: 'Tên nguồn mới nhất', importedAt: '25/09/2026' });
  const stagedThird = await stageHanoiCheckBatch(traceUrl(), third, '<html>third</html>', db);
  await assert.rejects(
    reviewHanoiCheckSnapshot(stagedSecond.snapshotId, payloadHash(second), 'approve', ['name'], db),
    /bản nguồn mới hơn/i,
  );
  await assert.rejects(
    reviewHanoiCheckSnapshot(stagedThird.snapshotId, payloadHash(second), 'approve', ['name'], db),
    /đã thay đổi/i,
  );
  await reviewHanoiCheckSnapshot(stagedThird.snapshotId, payloadHash(third), 'approve', ['name'], db);
  const approved = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });
  assert.equal(approved.name, 'Tên nguồn mới nhất');
  assert.equal(approved.receivedAt?.toISOString(), '2026-09-18T17:00:00.000Z');
  assert.equal(approved.sourcePayloadHash, payloadHash(third));
  assert.equal(approved.publicId, batch.publicId);
  assert.equal(approved.isPublic, true);
});

test('a byte-for-byte reversion to an older approved payload is reopened for review', async (t) => {
  const { db, source, batch, staged } = await approvedBatch(t);
  await db.batch.update({ where: { id: batch.id }, data: { isPublic: true, everPublished: true } });
  const newer = detail({ batchName: 'Phiên bản C từ nguồn', importedAt: '25/09/2026' });
  const stagedNewer = await stageHanoiCheckBatch(traceUrl(), newer, '<html>C</html>', db);
  await reviewHanoiCheckSnapshot(stagedNewer.snapshotId, payloadHash(newer), 'approve', [], db);

  const reverted = await stageHanoiCheckBatch(traceUrl(), source, '<html>A observed again</html>', db);
  const accepted = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });
  const historical = await db.hanoiCheckSnapshot.findUniqueOrThrow({ where: { id: staged.snapshotId } });
  const newest = await db.hanoiCheckSnapshot.findFirstOrThrow({ where: { sourceKey: historical.sourceKey }, orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }] });

  assert.equal(reverted.action, 'pending');
  assert.equal(historical.status, 'PENDING');
  assert.equal(historical.reviewedAt, null);
  assert.equal(newest.id, historical.id);
  assert.match(historical.reason ?? '', /phiên bản cũ/i);
  assert.equal(accepted.sourcePayloadHash, payloadHash(newer));
  assert.equal(accepted.isPublic, true);
  assert.equal(accepted.publicId, batch.publicId);

  await reviewHanoiCheckSnapshot(historical.id, payloadHash(source), 'approve', [], db);
  const reapproved = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });
  assert.equal(reapproved.sourcePayloadHash, payloadHash(source));
  assert.equal(reapproved.publicId, batch.publicId);
});

test('the same batch code from another HanoiCheck connection is quarantined instead of sharing a QR', async (t) => {
  const { db } = await fixture(t);
  const first = await stageHanoiCheckBatch(traceUrl('CONNECTION-A'), detail(), '<html>A</html>', db);
  const second = await stageHanoiCheckBatch(traceUrl('CONNECTION-B'), detail(), '<html>B</html>', db);

  assert.equal(first.action, 'created');
  assert.equal(second.action, 'pending');
  assert.equal(second.publicId, null);
  assert.equal(await db.batch.count(), 1);
  const collision = await db.hanoiCheckSnapshot.findUniqueOrThrow({ where: { id: second.snapshotId } });
  assert.equal(collision.batchId, null);
  assert.match(collision.reason ?? '', /khác định danh nguồn/i);
});

test('an unknown supplier stays snapshot-only until an explicit mapping is approved', async (t) => {
  const { db, supplier1 } = await fixture(t);
  await db.hanoiCheckSupplierMapping.delete({ where: { externalCode: 'NCC-01' } });
  const first = await stageHanoiCheckBatch(traceUrl(), detail(), '<html>unmapped</html>', db);
  const pending = await db.hanoiCheckSnapshot.findUniqueOrThrow({ where: { id: first.snapshotId } });

  assert.equal(first.action, 'pending');
  assert.equal(first.publicId, null);
  assert.equal(pending.batchId, null);
  assert.match(pending.reason ?? '', /chưa duyệt ánh xạ/i);
  assert.equal(await db.product.count(), 0);
  assert.equal(await db.batch.count(), 0);

  await db.hanoiCheckSupplierMapping.create({ data: { externalCode: 'NCC-01', supplierId: supplier1.id } });
  const imported = await stageHanoiCheckBatch(traceUrl(), detail(), '<html>same source after mapping</html>', db);
  assert.equal(imported.action, 'created');
  assert.ok(imported.publicId);
  assert.equal(imported.snapshotId, first.snapshotId);
  assert.equal(await db.batch.count(), 1);
  assert.equal((await db.hanoiCheckSnapshot.findUniqueOrThrow({ where: { id: first.snapshotId } })).batchId != null, true);
});

test('a supplier mapping mismatch unpublishes the batch and cannot be approved', async (t) => {
  const { db, supplier2, batch } = await approvedBatch(t);
  await db.batch.update({ where: { id: batch.id }, data: { isPublic: true, everPublished: true, name: 'Dữ liệu nội bộ' } });
  await db.hanoiCheckSupplierMapping.update({ where: { externalCode: 'NCC-01' }, data: { supplierId: supplier2.id } });
  const changed = detail({ batchName: 'Nguồn sau khi đổi ánh xạ' });
  const staged = await stageHanoiCheckBatch(traceUrl(), changed, '<html>mapping mismatch</html>', db);
  const held = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });
  const snapshot = await db.hanoiCheckSnapshot.findUniqueOrThrow({ where: { id: staged.snapshotId } });

  assert.equal(held.name, 'Dữ liệu nội bộ');
  assert.equal(held.isPublic, false);
  assert.equal(held.everPublished, true);
  assert.equal(held.sourceReviewStatus, 'NEEDS_REVIEW');
  assert.match(snapshot.reason ?? '', /khác ánh xạ nguồn/i);
  await assert.rejects(
    reviewHanoiCheckSnapshot(staged.snapshotId, payloadHash(changed), 'approve', [], db),
    /không khớp lô/i,
  );
});

test('an identical replay re-evaluates a mapping changed after approval', async (t) => {
  const { db, supplier2, source, batch } = await approvedBatch(t);
  await db.batch.update({ where: { id: batch.id }, data: { isPublic: true, everPublished: true } });
  await db.hanoiCheckSupplierMapping.update({ where: { externalCode: 'NCC-01' }, data: { supplierId: supplier2.id } });

  const replay = await stageHanoiCheckBatch(traceUrl(), source, '<html>same payload after mapping change</html>', db);
  const held = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });

  assert.equal(replay.action, 'unchanged');
  assert.equal(replay.publicId, batch.publicId);
  assert.equal(held.isPublic, false);
  assert.equal(held.everPublished, true);
  assert.equal(held.sourceReviewStatus, 'NEEDS_REVIEW');
});

test('a source verification revocation is held private and cannot be approved', async (t) => {
  const { db, batch } = await approvedBatch(t);
  await db.batch.update({ where: { id: batch.id }, data: { isPublic: true, everPublished: true } });
  const revoked = detail({ verified: false });
  const staged = await stageHanoiCheckBatch(traceUrl(), revoked, '<html>unverified</html>', db);
  const held = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });

  assert.equal(held.isPublic, false);
  assert.equal(held.everPublished, true);
  assert.equal(held.sourceReviewStatus, 'NEEDS_REVIEW');
  await assert.rejects(
    reviewHanoiCheckSnapshot(staged.snapshotId, payloadHash(revoked), 'approve', [], db),
    /chưa xác thực/i,
  );

  // Returning to the exact already-approved bytes may restore the approval
  // state, but publication remains an explicit admin action.
  await stageHanoiCheckBatch(traceUrl(), detail(), '<html>verified again</html>', db);
  const restored = await db.batch.findUniqueOrThrow({ where: { id: batch.id } });
  assert.equal(restored.sourceReviewStatus, 'APPROVED');
  assert.equal(restored.sourceVerified, true);
  assert.equal(restored.isPublic, false);
});

test('Vietnamese dates, sync ranges, and supplier codes are strict', () => {
  assert.equal(parseVietnameseDate('29/02/2024')?.toISOString(), '2024-02-28T17:00:00.000Z');
  assert.equal(parseVietnameseDate('29/02/2023'), null);
  assert.equal(parseVietnameseDate('31/04/2026'), null);
  assert.equal(parseVietnameseDate('1/01/2026'), null);
  assert.equal(parseVietnameseDate('01/13/2026'), null);
  assert.doesNotThrow(() => validateSyncDates('2026-09-01', '2026-10-01'));
  assert.throws(() => validateSyncDates('2026-09-01', '2026-10-02'), /tối đa 31 ngày/i);
  assert.throws(() => validateSyncDates('2026-02-29', '2026-03-01'), /ngày hợp lệ/i);
  assert.throws(() => validateSourceDates(detail({ producedAt: '30/09/2026', expiresAt: '29/09/2026' })), /trước ngày sản xuất/i);
  assert.throws(() => validateSourceDates(detail({ importedAt: '31/09/2026' })), /importedAt/);
  assert.equal(sourceSupplierCode(detail()), 'NCC-01');
  assert.throws(() => sourceSupplierCode(detail({ batchCode: 'LO-NCC02-001' })), /không khớp/i);
});
