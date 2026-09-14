import { prisma } from './prisma';

export async function audit(input: { supplierId?: number | null; action: string; entity: string; entityId?: string; summary: string }) {
  return prisma.auditLog.create({ data: input });
}
