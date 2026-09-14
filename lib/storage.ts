import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const validFilename = /^[A-Za-z0-9.-]+\.(pdf|jpg|png)$/i;

export function uploadDirectory() {
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads'));
}

function resolveUpload(filename: string) {
  if (!validFilename.test(filename)) throw new Error('INVALID_UPLOAD_FILENAME');
  const directory = uploadDirectory();
  const resolved = path.resolve(directory, filename);
  if (path.dirname(resolved) !== directory) throw new Error('INVALID_UPLOAD_PATH');
  return resolved;
}

export async function saveUpload(bytes: Uint8Array, extension: string) {
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  await writeFile(resolveUpload(filename), bytes, { flag: 'wx' });
  return filename;
}

export function loadUpload(filename: string) {
  return readFile(/* turbopackIgnore: true */ resolveUpload(filename));
}
