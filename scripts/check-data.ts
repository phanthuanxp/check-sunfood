import { prisma } from '../lib/prisma';
import { computeDataWarnings } from '../lib/data-warnings';

const expectedCodes = Array.from({ length: 23 }, (_, index) => `NCC-${String(index + 1).padStart(2, '0')}`);

try {
  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { documents: true } }, documents: { select: { title: true, expiresAt: true } } },
    orderBy: { code: 'asc' }
  });
  const actualCodes = suppliers.map(({ code }) => code);
  const missingCodes = expectedCodes.filter(code => !actualCodes.includes(code));
  const unexpectedCodes = actualCodes.filter(code => !expectedCodes.includes(code));
  const duplicateCodes = actualCodes.filter((code, index) => actualCodes.indexOf(code) !== index);
  const incomplete = suppliers.filter(supplier => !supplier.name || !supplier.productName || !supplier.address);
  const untranslated = suppliers.filter(supplier => !supplier.nameEn || !supplier.productNameEn || !supplier.addressEn);
  const withoutDocuments = suppliers.filter(supplier => supplier._count.documents === 0);
  const pending = suppliers.filter(supplier => supplier.verificationStatus !== 'VERIFIED');
  const warnings = computeDataWarnings(suppliers);
  const criticalWarnings = warnings.filter(w => w.severity === 'critical');

  console.log(JSON.stringify({
    suppliers: suppliers.length,
    requiredCodesComplete: missingCodes.length === 0,
    missingCodes,
    unexpectedCodes,
    duplicateCodes,
    requiresDataReview: {
      incomplete: incomplete.map(({ code }) => code),
      untranslated: untranslated.map(({ code }) => code),
      withoutDocuments: withoutDocuments.map(({ code }) => code),
      notVerified: pending.map(({ code }) => code)
    },
    dataWarnings: { total: warnings.length, critical: criticalWarnings.length, items: warnings }
  }, null, 2));

  if (suppliers.length !== 23 || missingCodes.length || unexpectedCodes.length || duplicateCodes.length) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
