import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const adapterRequire = createRequire(require.resolve('@prisma/adapter-better-sqlite3'));
const Database = adapterRequire('better-sqlite3');

function inventory(database) {
  const integrity = database.pragma('integrity_check').map(row => row.integrity_check);
  if (integrity.length !== 1 || integrity[0] !== 'ok') throw new Error('SQLite integrity check failed.');
  if (database.pragma('foreign_key_check').length) throw new Error('SQLite foreign-key check failed.');
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name }) => [name,
    database.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get().count,
  ]));
}

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest('hex');
}

async function copyPrivateTree(source, destination, prefix = '') {
  await mkdir(destination, { mode: 0o700 });
  const files = [];
  const entries = await readdir(source, { withFileTypes: true });
  const initialNames = entries.map(entry => `${entry.name}:${entry.isDirectory() ? 'd' : entry.isFile() ? 'f' : entry.isSymbolicLink() ? 'l' : 'o'}`).sort();
  for (const entry of entries) {
    const input = path.join(source, entry.name);
    const output = path.join(destination, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Uploads snapshot refuses internal symlinks. Resolve them before backup.');
    if (entry.isDirectory()) files.push(...await copyPrivateTree(input, output, relative));
    else if (entry.isFile()) {
      const before = await stat(input);
      await copyFile(input, output, 1 /* COPYFILE_EXCL */);
      await chmod(output, 0o600);
      const after = await stat(input);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Upload changed during snapshot. Pause writes and take a fresh backup.');
      const sha256 = await digest(output);
      if (sha256 !== await digest(input)) throw new Error('Upload changed during verification. Pause writes and take a fresh backup.');
      files.push({ path: relative, bytes: after.size, sha256 });
    } else throw new Error('Uploads snapshot contains an unsupported file type.');
  }
  const finalEntries = await readdir(source, { withFileTypes: true });
  const finalNames = finalEntries.map(entry => `${entry.name}:${entry.isDirectory() ? 'd' : entry.isFile() ? 'f' : entry.isSymbolicLink() ? 'l' : 'o'}`).sort();
  if (JSON.stringify(initialNames) !== JSON.stringify(finalNames)) {
    throw new Error('Uploads changed during snapshot. Pause writes and take a fresh backup.');
  }
  return files;
}

export async function backupRelease({ database, destination, envFile, uploadsDir, nginxFile }) {
  for (const [label, value] of Object.entries({ database, destination, envFile, uploadsDir })) {
    if (!value || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`);
  }
  if (nginxFile && !path.isAbsolute(nginxFile)) throw new Error('nginxFile must be absolute.');
  const inputDatabase = await realpath(database);
  const inputUploads = await realpath(uploadsDir);
  const destinationParent = await realpath(path.dirname(destination));
  const resolvedDestination = path.join(destinationParent, path.basename(destination));
  const withinUploads = path.relative(inputUploads, resolvedDestination);
  if (!withinUploads || (!withinUploads.startsWith('..') && !path.isAbsolute(withinUploads))) throw new Error('Backup destination cannot be inside uploads.');
  for (const file of [inputDatabase, envFile, nginxFile].filter(Boolean)) {
    if (!(await stat(file)).isFile()) throw new Error('Backup input must be an existing file.');
  }
  if (!(await stat(inputUploads)).isDirectory()) throw new Error('uploadsDir must be an existing directory.');
  // Exclusive directory creation prevents overwriting any previous backup.
  await mkdir(resolvedDestination, { mode: 0o700 });
  const manifestFile = path.join(resolvedDestination, 'backup-manifest.json');
  const manifest = { createdAt: new Date().toISOString(), status: 'incomplete', database: inputDatabase };
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const backupFile = path.join(resolvedDestination, 'database.sqlite');
  const source = new Database(inputDatabase, { readonly: true, fileMustExist: true });
  try { await source.backup(backupFile); } finally { source.close(); }
  await chmod(backupFile, 0o600);
  const snapshot = new Database(backupFile, { readonly: true, fileMustExist: true });
  let counts;
  const restoreFile = path.join(resolvedDestination, 'restore-verified.sqlite');
  try {
    counts = inventory(snapshot);
    await snapshot.backup(restoreFile);
  } finally { snapshot.close(); }
  await chmod(restoreFile, 0o600);
  const restored = new Database(restoreFile, { readonly: true, fileMustExist: true });
  try {
    if (JSON.stringify(inventory(restored)) !== JSON.stringify(counts)) throw new Error('Restored snapshot table counts differ.');
  } finally { restored.close(); }
  for (const [input, name] of [[envFile, 'runtime.env'], [nginxFile, 'nginx.conf']]) {
    if (!input) continue;
    await copyFile(input, path.join(resolvedDestination, name), 1);
    await chmod(path.join(resolvedDestination, name), 0o600);
  }
  const uploads = await copyPrivateTree(inputUploads, path.join(resolvedDestination, 'uploads'));
  Object.assign(manifest, { status: 'verified', counts, databaseSha256: await digest(backupFile), restoreVerified: true, uploads,
    note: 'SQLite snapshot is transaction-consistent. Pause application/worker writes for a cross-file consistent database + uploads snapshot.' });
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  return { destination: resolvedDestination, counts, uploadedFiles: uploads.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      database: { type: 'string' }, destination: { type: 'string' },
      'env-file': { type: 'string' }, 'uploads-dir': { type: 'string' }, 'nginx-file': { type: 'string' },
    } });
    const result = await backupRelease({ database: values.database, destination: values.destination,
      envFile: values['env-file'], uploadsDir: values['uploads-dir'], nginxFile: values['nginx-file'] });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Backup failed; retain any incomplete snapshot for inspection. ${error.code || error.message}`);
    process.exitCode = 1;
  }
}
