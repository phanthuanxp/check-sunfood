import { prisma } from '../lib/prisma';
import { suppliers } from '../data/suppliers';

async function main() {
  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { code: supplier.code },
      // Seed only missing codes. Admin-reviewed records must survive redeploys.
      update: {},
      create: supplier
    });
  }
  console.log(`Ensured ${suppliers.length} supplier codes exist; existing records were not changed.`);
}

main().finally(() => prisma.$disconnect());
