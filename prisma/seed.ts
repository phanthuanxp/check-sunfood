import { prisma } from '../lib/prisma';
import { suppliers } from '../data/suppliers';

async function main() {
  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { code: supplier.code },
      update: supplier,
      create: supplier
    });
  }
  console.log(`Seeded ${suppliers.length} suppliers.`);
}

main().finally(() => prisma.$disconnect());
