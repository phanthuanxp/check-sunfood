import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };
const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const adapter = /^(postgresql|postgres):\/\//.test(databaseUrl)
  ? new PrismaPg({ connectionString: databaseUrl })
  : new PrismaBetterSqlite3({ url: databaseUrl });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
