import { prisma } from '@/lib/prisma';

type LeaseClient = Pick<typeof prisma, 'integrationLease'>;

/** Atomic claim shared by processes using the same database. Expired owners cannot release a new owner's lease. */
export async function acquireIntegrationLease(key: string, owner: string, ttlMs: number, client: LeaseClient = prisma) {
  if (!key || !owner || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('INVALID_INTEGRATION_LEASE');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const claimed = await client.integrationLease.updateMany({ where: { key, expiresAt: { lte: now } }, data: { owner, expiresAt } });
  if (claimed.count === 1) return true;
  try {
    await client.integrationLease.create({ data: { key, owner, expiresAt } });
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return false;
    throw error;
  }
}

export async function releaseIntegrationLease(key: string, owner: string, client: LeaseClient = prisma) {
  await client.integrationLease.deleteMany({ where: { key, owner } });
}
