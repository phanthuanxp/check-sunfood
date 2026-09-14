import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { productionConfigurationIssues } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  try {
    const [supplierCount, documentCount, verifiedCount] = await Promise.all([
      prisma.supplier.count(),
      prisma.document.count(),
      prisma.supplier.count({ where: { verificationStatus: 'VERIFIED' } })
    ]);
    const expectedCodes = Array.from({ length: 23 }, (_, index) => `NCC-${String(index + 1).padStart(2, '0')}`);
    const suppliers = await prisma.supplier.findMany({ select: { code: true } });
    const availableCodes = new Set(suppliers.map(({ code }) => code));
    const missingCodes = expectedCodes.filter(code => !availableCodes.has(code));
    const configurationIssues = productionConfigurationIssues();
    const isHealthy = missingCodes.length === 0 && configurationIssues.length === 0;

    return NextResponse.json({
      status: isHealthy ? 'ok' : 'degraded',
      database: 'connected',
      checks: {
        suppliers: supplierCount,
        requiredSupplierCodes: 23,
        missingCodes,
        documents: documentCount,
        verifiedSuppliers: verifiedCount,
        configurationIssues
      },
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    }, { status: isHealthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({
      status: 'down',
      database: 'unavailable',
      timestamp: new Date().toISOString()
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
