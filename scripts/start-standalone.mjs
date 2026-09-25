import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.PORT ||= '3010';

// The generated .next/standalone/server.js does process.chdir(__dirname), moving the cwd
// into .next/standalone/ — any relative DATABASE_URL/UPLOAD_DIR configured against the
// project root would then resolve to the wrong place. Anchor them to the real root first.
if (process.env.DATABASE_URL?.startsWith('file:')) {
  const relPath = process.env.DATABASE_URL.slice(5);
  if (!path.isAbsolute(relPath)) {
    process.env.DATABASE_URL = `file:${path.resolve(root, relPath).replace(/\\/g, '/')}`;
  }
}
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(root, process.env.UPLOAD_DIR)
  : path.join(root, 'storage', 'uploads');

await import('../.next/standalone/server.js');
