import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

// Credentials must be loaded before importing Prisma or any integration module.
// PM2 may also pass --env-file, but the worker enforces the same contract when
// an operator starts it directly for local or recovery work.
const envFile = process.env.SUNFOOD_ENV_FILE;
if (envFile) {
  if (!path.isAbsolute(envFile)) throw new Error('SUNFOOD_ENV_FILE must be absolute.');
  const info = await stat(envFile);
  if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('SUNFOOD_ENV_FILE must be a protected file (mode 600).');
  const configured = parseEnv(await readFile(envFile, 'utf8'));
  for (const [key, value] of Object.entries(configured)) if (process.env[key] === undefined) process.env[key] = value;
} else {
  await import('dotenv/config');
}

const [{ runNextSyncJob }, { prisma }] = await Promise.all([
  import('../lib/hanoicheck-jobs'),
  import('../lib/prisma'),
]);

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
do {
  try { if (!await runNextSyncJob() && !process.argv.includes('--once')) await new Promise(resolve => setTimeout(resolve, 3000)); }
  catch { console.error('Không xử lý được hàng chờ HanoiCheck; kiểm tra DB và worker.'); if (!process.argv.includes('--once')) await new Promise(resolve => setTimeout(resolve, 5000)); }
} while (!stopping && !process.argv.includes('--once'));
await prisma.$disconnect();
