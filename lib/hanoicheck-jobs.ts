import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { validatedHanoiCheckTraceUrl } from './hanoicheck-trace';
import { validateSyncDates } from './hanoicheck-normalize';
import { syncBatchesFromExcelRecords, syncBatchesFromOrders, type BulkSyncResult } from './hanoicheck-sync';
import type { PrismaClient } from '../generated/prisma/client';

export type SyncJobInput = { kind: 'URLS'; urls: string[] } | { kind: 'ORDERS'; dateFrom: string; dateTo: string };
const LEASE_MS = 120_000;

export function validateJobInput(input: SyncJobInput): SyncJobInput {
  if (input.kind === 'URLS') {
    if (!Array.isArray(input.urls) || !input.urls.length || input.urls.length > 500) throw new Error('Cần từ 1 đến 500 URL truy xuất.');
    return { kind: 'URLS', urls: [...new Set(input.urls.map(url => validatedHanoiCheckTraceUrl(url).replace(/\/$/, '')))] };
  }
  if (input.kind !== 'ORDERS') throw new Error('Loại đồng bộ không hợp lệ.');
  validateSyncDates(input.dateFrom, input.dateTo);
  return input;
}

export async function enqueueSyncJob(input: SyncJobInput, db: PrismaClient = prisma) {
  const value = validateJobInput(input);
  return db.$transaction(async tx => {
    if (await tx.hanoiCheckSyncJob.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }) >= 20) {
      throw new Error('Đang có nhiều lượt đồng bộ chờ xử lý; thử lại sau.');
    }
    const job = await tx.hanoiCheckSyncJob.create({
      data: { kind: value.kind, payload: JSON.stringify(value) },
      select: { id: true, status: true },
    });
    await tx.auditLog.create({
      data: { action: 'CREATE', entity: 'HANOICHECK_JOB', entityId: job.id, summary: `Tạo lượt đồng bộ HanoiCheck loại ${value.kind}.` },
    });
    return job;
  });
}

export async function claimSyncJob(db: PrismaClient = prisma, now = new Date()) {
  const stale = { status: 'RUNNING', leaseExpiresAt: { lt: now } };
  await db.hanoiCheckSyncJob.updateMany({ where: { ...stale, attempts: { gte: 3 } }, data: { status: 'FAILED', error: 'Worker gián đoạn quá 3 lần; kiểm tra rồi tạo lượt mới.', completedAt: now, leaseOwner: null, leaseExpiresAt: null } });
  const candidate = await db.hanoiCheckSyncJob.findFirst({ where: { OR: [{ status: 'QUEUED' }, { ...stale, attempts: { lt: 3 } }] }, orderBy: { createdAt: 'asc' } });
  if (!candidate) return null;
  const owner = randomUUID();
  const claimed = await db.hanoiCheckSyncJob.updateMany({
    where: { id: candidate.id, status: candidate.status, leaseOwner: candidate.leaseOwner, ...(candidate.status === 'RUNNING' ? { leaseExpiresAt: { lt: now } } : {}) },
    data: { status: 'RUNNING', leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 }, startedAt: now, error: null },
  });
  return claimed.count ? { ...candidate, leaseOwner: owner } : null;
}

export type CancelSyncJobOutcome =
  | { outcome: 'cancelled'; status: 'CANCELLED'; alreadyCancelled: boolean }
  | { outcome: 'missing' }
  | { outcome: 'finished'; status: string }
  | { outcome: 'race'; status: string | null };

export async function cancelSyncJob(id: string, db: PrismaClient = prisma, now = new Date()): Promise<CancelSyncJobOutcome> {
  if (!id || id.length > 128) throw new Error('Mã lượt đồng bộ không hợp lệ.');
  return db.$transaction(async tx => {
    const current = await tx.hanoiCheckSyncJob.findUnique({ where: { id }, select: { status: true, leaseOwner: true } });
    if (!current) return { outcome: 'missing' };
    if (current.status === 'CANCELLED') return { outcome: 'cancelled', status: 'CANCELLED', alreadyCancelled: true };
    if (!['QUEUED', 'RUNNING'].includes(current.status)) return { outcome: 'finished', status: current.status };
    const cancelled = await tx.hanoiCheckSyncJob.updateMany({
      where: { id, status: current.status, leaseOwner: current.leaseOwner },
      data: { status: 'CANCELLED', completedAt: now, leaseOwner: null, leaseExpiresAt: null },
    });
    if (!cancelled.count) {
      const latest = await tx.hanoiCheckSyncJob.findUnique({ where: { id }, select: { status: true } });
      return { outcome: 'race', status: latest?.status ?? null };
    }
    await tx.auditLog.create({
      data: { action: 'CANCEL', entity: 'HANOICHECK_JOB', entityId: id, summary: `Hủy lượt đồng bộ HanoiCheck ${id}.` },
    });
    return { outcome: 'cancelled', status: 'CANCELLED', alreadyCancelled: false };
  });
}

export async function runNextSyncJob(db: PrismaClient = prisma) {
  const job = await claimSyncJob(db);
  if (!job) return false;
  let lost = false;
  const owned = { id: job.id, leaseOwner: job.leaseOwner, status: 'RUNNING' };
  const heartbeat = setInterval(() => { void db.hanoiCheckSyncJob.updateMany({ where: owned, data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } }).then(result => { if (!result.count) lost = true; }).catch(() => { lost = true; }); }, 20_000);
  const progress = async (result: BulkSyncResult) => {
    if (lost) throw new Error('Worker đã mất quyền xử lý lượt đồng bộ.');
    const changed = await db.hanoiCheckSyncJob.updateMany({ where: owned, data: { result: JSON.stringify(result), leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
    if (!changed.count) throw new Error('Lượt đồng bộ đã bị hủy hoặc chuyển worker.');
  };
  try {
    const input = validateJobInput(JSON.parse(job.payload));
    const result = input.kind === 'URLS'
      ? await syncBatchesFromExcelRecords(input.urls.map(url => ({ 'Link truy xuất': url })), progress)
      : await syncBatchesFromOrders(input.dateFrom, input.dateTo, progress);
    await progress(result);
    const status = result.skipped.length ? (result.skipped.length >= result.processed ? 'FAILED' : 'PARTIAL') : 'SUCCEEDED';
    await db.$transaction(async tx => {
      const finished = await tx.hanoiCheckSyncJob.updateMany({ where: owned, data: { status, result: JSON.stringify(result), completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });
      if (!finished.count) return;
      await tx.hanoiCheckIntegrationSettings.upsert({ where: { id: 1 }, create: { id: 1, lastSyncedAt: new Date(), lastSyncStatus: status, lastSyncCount: result.created + result.pending }, update: { lastSyncedAt: new Date(), lastSyncStatus: status, lastSyncCount: result.created + result.pending } });
      await tx.auditLog.create({ data: { action: 'SYNC', entity: 'HANOICHECK_JOB', entityId: job.id, summary: `Đồng bộ ${status}: ${result.processed} nguồn, ${result.created} lô mới, ${result.pending} bản chờ duyệt, ${result.skipped.length} lỗi.` } });
    });
  } catch (error) {
    await db.hanoiCheckSyncJob.updateMany({ where: owned, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 300) : 'Đồng bộ thất bại.', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });
  } finally { clearInterval(heartbeat); }
  return true;
}
