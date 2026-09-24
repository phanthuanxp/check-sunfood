import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migratePhase12, parseMigrationArgs } from '../scripts/migrate-phase12';

const legacySql = readFileSync(new URL('./fixtures/phase12-legacy.sql', import.meta.url), 'utf8');

function fixture(t: { after: (fn: () => void) => void }, layout: 'local' | 'live' | 'merged' | 'legacy' = 'legacy') {
  const directory = mkdtempSync(join(tmpdir(), 'sunfood-phase12-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'existing.db');
  const backupPath = join(directory, 'before-upgrade.db');
  const db = new Database(databasePath);
  db.exec(legacySql);
  db.exec(`
    INSERT INTO Supplier (id, code, name, updatedAt, verificationStatus) VALUES
      (7, 'NCC-01', 'Nhà cung cấp đã duyệt', '2026-09-24', 'VERIFIED'),
      (19, 'NCC-23', 'Nhà cung cấp chờ duyệt', '2026-09-24', 'PENDING');
    INSERT INTO Product (id, supplierId, name, sku, origin, isPublic) VALUES
      (42, 7, 'Tên Sunfood đã chỉnh', 'PROD-1', 'Địa chỉ đã kiểm tra', 1);
    INSERT INTO Batch (id, publicId, productId, code, sourceSystem, sourceKey, sourcePayload, isPublic, everPublished) VALUES
      (99, 'stable-lot-qr-001', 42, 'LOT-001', 'HANOICHECK', 'legacy-source-001', '{"verified":true}', 1, 1),
      (104, 'stable-lot-qr-002', 42, 'LOT-002', 'LOCAL', null, null, 0, 1);
    INSERT INTO TraceEvent (id, batchId, occurredAt, stage, title, details, isPublic) VALUES
      (321, 99, '2026-09-22', 'TRANSPORT', 'Nội dung Sunfood sửa', 'Giữ nguyên thông tin này', 1),
      (325, 99, '2026-09-23', 'RECEIPT', 'Chờ xác minh', null, 0);
    INSERT INTO Document (id, supplierId, title, fileUrl, updatedAt) VALUES (4, 7, 'Hồ sơ riêng tư', '/api/uploads/private.pdf', '2026-09-24');
    INSERT INTO DocumentVersion (id, documentId, fileUrl, note) VALUES (6, 4, '/api/uploads/old.pdf', 'Giữ nguyên phiên bản');
    INSERT INTO AuditLog (id, supplierId, action, entity, summary) VALUES (8, 7, 'UPDATE', 'Supplier', 'Admin reviewed');
    INSERT INTO ImportDraft (id, code, sourceUrl, sourceHash, payload) VALUES (3, 'NCC-01', 'https://example.test', 'hash', '{"name":"Draft"}');
    INSERT INTO AiIntegrationSettings (id, encryptedApiKey, updatedAt) VALUES (1, 'encrypted-fixture-no-real-secret', '2026-09-24');
    INSERT INTO HanoiCheckIntegrationSettings (id, encryptedClientSecret, updatedAt) VALUES (1, 'encrypted-fixture-no-real-secret', '2026-09-24');
  `);
  if (layout === 'local' || layout === 'merged') {
    db.exec('ALTER TABLE Supplier ADD COLUMN phone TEXT; ALTER TABLE Supplier ADD COLUMN website TEXT; ALTER TABLE Supplier ADD COLUMN email TEXT; ALTER TABLE Supplier ADD COLUMN description TEXT; ALTER TABLE Supplier ADD COLUMN descriptionEn TEXT;');
    db.prepare('UPDATE Supplier SET phone = ?, website = ?, email = ?, description = ?, descriptionEn = ? WHERE id = 7').run('0123456789', 'https://supplier.example.test', 'supplier@example.test', 'Giới thiệu NCC', 'Supplier introduction');
  }
  if (layout === 'live' || layout === 'merged') {
    db.exec('ALTER TABLE Product ADD COLUMN imageUrl TEXT;');
    db.prepare('UPDATE Product SET imageUrl = ? WHERE id = 42').run('/api/uploads/existing-product.png');
  }
  db.close();
  return { directory, databasePath, backupPath };
}

function getRows(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
    return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all() as Record<string, unknown>[]]));
  } finally {
    db.close();
  }
}

for (const layout of ['local', 'live', 'merged'] as const) {
  test(`upgrades ${layout} divergence additively, preserves all existing rows/QRs/flags, and restores backup`, async (t) => {
    const paths = fixture(t, layout);
    const before = getRows(paths.databasePath);
    const bytes = readFileSync(paths.databasePath);
    const dryRun = await migratePhase12({ databasePath: paths.databasePath });
    assert.equal(dryRun.status, 'dry-run');
    assert.ok(dryRun.changes.length > 0);
    assert.deepEqual(readFileSync(paths.databasePath), bytes);
    assert.equal(existsSync(paths.backupPath), false);

    const report = await migratePhase12({ ...paths, apply: true });
    assert.equal(report.status, 'applied');
    assert.equal(report.integrity, 'ok');
    assert.equal(report.existingRowsPreserved, true);
    assert.equal(report.originalCounts.Supplier, 2);
    assert.equal(report.originalCounts.Batch, 2);
    assert.equal(report.originalCounts.TraceEvent, 2);
    assert.equal(JSON.stringify(report).includes('encrypted-fixture'), false);
    const after = getRows(paths.databasePath);
    for (const [table, rows] of Object.entries(before)) {
      assert.equal(after[table].length, rows.length, `${table} count unchanged`);
      for (const [index, row] of rows.entries()) {
        for (const [column, value] of Object.entries(row)) assert.deepEqual(after[table][index][column], value, `${table}.${column} unchanged`);
      }
    }
    assert.equal(after.Batch[0].sourceReviewStatus, 'LEGACY');
    assert.equal(after.Batch[0].sourceVerified, null);
    assert.equal(after.Batch[0].sourcePayloadHash, null);
    assert.equal(after.TraceEvent[0].sourceKey, null);
    assert.equal(after.HanoiCheckSupplierMapping.length, 0);
    assert.equal(after.HanoiCheckSnapshot.length, 0);
    assert.equal(after.HanoiCheckSyncJob.length, 0);
    assert.equal(after.IntegrationLease.length, 0);
    assert.equal(after._prisma_migrations, undefined);

    // Exercise restoration to a different file, never overwrite the active DB.
    const restoredPath = join(paths.directory, 'restored-copy.db');
    const backup = new Database(paths.backupPath, { readonly: true, fileMustExist: true });
    await backup.backup(restoredPath);
    backup.close();
    assert.deepEqual(getRows(restoredPath), before);
    const restored = new Database(restoredPath, { readonly: true, fileMustExist: true });
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(restored.pragma('foreign_key_check'), []);
    restored.close();
    if (process.platform !== 'win32') assert.equal(statSync(paths.backupPath).mode & 0o777, 0o600);

    const second = await migratePhase12({ databasePath: paths.databasePath, apply: true, backupPath: join(paths.directory, 'second.db') });
    assert.equal(second.status, 'unchanged');
    assert.deepEqual(second.changes, []);
    assert.deepEqual(getRows(paths.databasePath), after);
    assert.equal(existsSync(join(paths.directory, 'second.db')), false);
  });
}

test('unique event identity failure rolls back every schema change and retains usable backup', async (t) => {
  const paths = fixture(t);
  const db = new Database(paths.databasePath);
  db.exec("ALTER TABLE TraceEvent ADD COLUMN sourceKey TEXT; UPDATE TraceEvent SET sourceKey = 'duplicate-event-key'");
  const schemaBefore = db.prepare('SELECT * FROM sqlite_master ORDER BY type, name').all();
  db.close();
  const rowsBefore = getRows(paths.databasePath);
  await assert.rejects(migratePhase12({ ...paths, apply: true }), /UNIQUE constraint failed/);
  const current = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
  assert.deepEqual(current.prepare('SELECT * FROM sqlite_master ORDER BY type, name').all(), schemaBefore);
  assert.equal(current.pragma('integrity_check', { simple: true }), 'ok');
  current.close();
  assert.deepEqual(getRows(paths.databasePath), rowsBefore);
  assert.deepEqual(getRows(paths.backupPath), rowsBefore);
});

test('missing path never creates a new empty database; relative paths and missing backups fail', async (t) => {
  const paths = fixture(t);
  const missing = join(paths.directory, 'does-not-exist.db');
  await assert.rejects(migratePhase12({ databasePath: missing }), /existing regular SQLite file/);
  assert.equal(existsSync(missing), false);
  await assert.rejects(migratePhase12({ databasePath: './existing.db' }), /absolute/);
  await assert.rejects(migratePhase12({ databasePath: paths.databasePath, apply: true }), /requires --backup/);
  await assert.rejects(migratePhase12({ databasePath: paths.databasePath, apply: true, backupPath: paths.databasePath }), /never overwritten/);
});

test('unsupported baseline and conflicting additive column types stop before creating backups', async (t) => {
  const paths = fixture(t);
  const db = new Database(paths.databasePath);
  db.exec('ALTER TABLE Supplier ADD COLUMN phone INTEGER');
  db.close();
  await assert.rejects(migratePhase12({ ...paths, apply: true }), /Conflicting column definition: Supplier.phone/);
  assert.equal(existsSync(paths.backupPath), false);
  const unsupported = new Database(paths.databasePath);
  unsupported.exec('ALTER TABLE Batch RENAME COLUMN sourcePayload TO oldPayload');
  unsupported.close();
  await assert.rejects(migratePhase12({ ...paths, apply: true }), /Unsupported starting schema: Batch/);
  assert.equal(existsSync(paths.backupPath), false);
});

test('WAL backup contains committed rows even when a separate writer keeps WAL open', async (t) => {
  const paths = fixture(t);
  const writer = new Database(paths.databasePath);
  writer.pragma('journal_mode = WAL');
  writer.pragma('wal_autocheckpoint = 0');
  writer.exec("UPDATE Supplier SET notes = 'committed in WAL' WHERE id = 7");
  try {
    await migratePhase12({ ...paths, apply: true });
    assert.equal(getRows(paths.backupPath).Supplier[0].notes, 'committed in WAL');
    assert.equal(getRows(paths.databasePath).Supplier[0].notes, 'committed in WAL');
  } finally {
    writer.close();
  }
});

test('CLI defaults to dry-run and rejects ambiguous flags', () => {
  assert.deepEqual(parseMigrationArgs(['--database', '/tmp/existing.db']), { databasePath: '/tmp/existing.db', apply: false, backupPath: undefined });
  assert.throws(() => parseMigrationArgs([]), /Required/);
  assert.throws(() => parseMigrationArgs(['--database']), /incomplete/);
  assert.throws(() => parseMigrationArgs(['--database', '/tmp/existing.db', '--backup', '/tmp/backup.db']), /only accepted with --apply/);
  assert.throws(() => parseMigrationArgs(['--database', '/tmp/existing.db', '--apply', '--apply']), /duplicate/);
});
