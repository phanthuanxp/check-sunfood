import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';
import { cancelSyncJob, claimSyncJob, enqueueSyncJob, validateJobInput } from '../lib/hanoicheck-jobs';
import { migratePhase12 } from '../scripts/migrate-phase12';

const legacySql = readFileSync(new URL('./fixtures/phase12-legacy.sql', import.meta.url), 'utf8');
const url = 'https://tracuu.hanoicheck.com.vn/NCC-2026-000232/truy-xuat/san-pham/TP-NCC-2026-000232-20260922-18063';

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'sunfood-sync-jobs-'));
  const databasePath = join(directory, 'test.db');
  const sqlite = new Database(databasePath);
  sqlite.exec(legacySql);
  sqlite.close();
  await migratePhase12({ databasePath, backupPath: join(directory, 'before.db'), apply: true });
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
  t.after(async () => {
    await db.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  });
  return db;
}

test('claim uses compare-and-swap so concurrent workers cannot own the same job', async (t) => {
  const db = await fixture(t);
  const queued = await enqueueSyncJob({ kind: 'URLS', urls: [url, `${url}/`] }, db);
  assert.equal(await db.auditLog.count({ where: { entity: 'HANOICHECK_JOB', entityId: queued.id, action: 'CREATE' } }), 1);
  const now = new Date('2026-09-24T00:00:00.000Z');
  const claims = await Promise.all([claimSyncJob(db, now), claimSyncJob(db, now)]);
  const winners = claims.filter(Boolean);

  assert.equal(winners.length, 1);
  assert.equal(winners[0]?.id, queued.id);
  assert.ok(winners[0]?.leaseOwner);
  const stored = await db.hanoiCheckSyncJob.findUniqueOrThrow({ where: { id: queued.id } });
  assert.equal(stored.status, 'RUNNING');
  assert.equal(stored.attempts, 1);
  assert.equal(stored.leaseOwner, winners[0]?.leaseOwner);
});

test('an expired lease retries at most three times and then becomes FAILED', async (t) => {
  const db = await fixture(t);
  const past = new Date('2026-09-23T00:00:00.000Z');
  const now = new Date('2026-09-24T00:00:00.000Z');
  const job = await db.hanoiCheckSyncJob.create({
    data: { kind: 'URLS', payload: JSON.stringify({ kind: 'URLS', urls: [url] }), status: 'RUNNING', attempts: 2, leaseOwner: 'dead-worker', leaseExpiresAt: past },
  });

  const retry = await claimSyncJob(db, now);
  assert.equal(retry?.id, job.id);
  assert.notEqual(retry?.leaseOwner, 'dead-worker');
  let stored = await db.hanoiCheckSyncJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(stored.attempts, 3);
  assert.equal(stored.status, 'RUNNING');

  await db.hanoiCheckSyncJob.update({ where: { id: job.id }, data: { leaseExpiresAt: past } });
  assert.equal(await claimSyncJob(db, now), null);
  stored = await db.hanoiCheckSyncJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(stored.status, 'FAILED');
  assert.equal(stored.leaseOwner, null);
  assert.match(stored.error ?? '', /3 lần/);
});

test('cancellation clears ownership and prevents both reclamation and stale-worker writes', async (t) => {
  const db = await fixture(t);
  const queued = await enqueueSyncJob({ kind: 'URLS', urls: [url] }, db);
  const claimed = await claimSyncJob(db, new Date('2026-09-24T00:00:00.000Z'));
  assert.equal(claimed?.id, queued.id);
  const cancelled = await cancelSyncJob(queued.id, db, new Date('2026-09-24T00:01:00.000Z'));

  assert.deepEqual(cancelled, { outcome: 'cancelled', status: 'CANCELLED', alreadyCancelled: false });
  assert.deepEqual(await cancelSyncJob(queued.id, db), { outcome: 'cancelled', status: 'CANCELLED', alreadyCancelled: true });
  assert.equal(await db.auditLog.count({ where: { entity: 'HANOICHECK_JOB', entityId: queued.id, action: 'CANCEL' } }), 1);
  assert.equal(await claimSyncJob(db, new Date('2026-09-24T00:02:00.000Z')), null);
  const staleWrite = await db.hanoiCheckSyncJob.updateMany({
    where: { id: queued.id, status: 'RUNNING', leaseOwner: claimed?.leaseOwner },
    data: { result: '{"should":"not persist"}' },
  });
  assert.equal(staleWrite.count, 0);
  const stored = await db.hanoiCheckSyncJob.findUniqueOrThrow({ where: { id: queued.id } });
  assert.equal(stored.status, 'CANCELLED');
  assert.equal(stored.leaseOwner, null);
  assert.equal(stored.result, null);
});

test('job creation and cancellation roll back when their audit cannot be persisted', async (t) => {
  const createDb = await fixture(t);
  await createDb.$executeRawUnsafe('DROP TABLE "AuditLog"');
  await assert.rejects(enqueueSyncJob({ kind: 'URLS', urls: [url] }, createDb));
  assert.equal(await createDb.hanoiCheckSyncJob.count(), 0);

  const cancelDb = await fixture(t);
  const queued = await enqueueSyncJob({ kind: 'URLS', urls: [url] }, cancelDb);
  const claimed = await claimSyncJob(cancelDb, new Date('2026-09-24T00:00:00.000Z'));
  assert.equal(claimed?.id, queued.id);
  await cancelDb.$executeRawUnsafe('DROP TABLE "AuditLog"');
  await assert.rejects(cancelSyncJob(queued.id, cancelDb));
  const preserved = await cancelDb.hanoiCheckSyncJob.findUniqueOrThrow({ where: { id: queued.id } });
  assert.equal(preserved.status, 'RUNNING');
  assert.equal(preserved.leaseOwner, claimed?.leaseOwner);
});

test('job validation canonicalizes URL lists and limits order ranges', () => {
  assert.deepEqual(validateJobInput({ kind: 'URLS', urls: [url, `${url}/`] }), { kind: 'URLS', urls: [url] });
  assert.throws(() => validateJobInput({ kind: 'URLS', urls: ['https://evil.example/trace'] }), /HanoiCheck/);
  assert.doesNotThrow(() => validateJobInput({ kind: 'ORDERS', dateFrom: '2026-09-01', dateTo: '2026-10-01' }));
  assert.throws(() => validateJobInput({ kind: 'ORDERS', dateFrom: '2026-09-01', dateTo: '2026-10-02' }), /31 ngày/);
});
