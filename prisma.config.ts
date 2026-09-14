import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const databaseUrl = env('DATABASE_URL');
const isPostgreSQL = /^(postgresql|postgres):\/\//.test(databaseUrl);

export default defineConfig({
  schema: isPostgreSQL ? 'prisma/schema.postgresql.prisma' : 'prisma/schema.prisma',
  migrations: {
    path: isPostgreSQL ? 'prisma/migrations-postgresql' : 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: {
    url: databaseUrl
  }
});
