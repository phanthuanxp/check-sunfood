import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Native Node ESM scripts are shared with deployment; avoid loading app code.
const { assertRuntimeCompatible, prepareStandalone, runtimeIdentity, verifyStandaloneNative } = await import(new URL('../scripts/prepare-standalone.mjs', import.meta.url).href);
const { runtimeEnvironment } = await import(new URL('../scripts/start-standalone.mjs', import.meta.url).href);
const { backupRelease } = await import(new URL('../deploy/backup-release.mjs', import.meta.url).href);
const require = createRequire(import.meta.url);
const Database = createRequire(require.resolve('@prisma/adapter-better-sqlite3'))('better-sqlite3');

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sunfood-release-test-'));
  await mkdir(path.join(root, 'uploads'));
  const database = path.join(root, 'source.sqlite');
  const sqlite = new Database(database);
  sqlite.exec('CREATE TABLE Supplier (code TEXT PRIMARY KEY); INSERT INTO Supplier VALUES (\'NCC-01\'), (\'NCC-23\');');
  sqlite.close();
  const envFile = path.join(root, 'runtime.env');
  await writeFile(envFile, `DATABASE_URL="file:${database.replaceAll('\\', '/')}"\nUPLOAD_DIR="${path.join(root, 'uploads').replaceAll('\\', '/')}"\nPORT=3099\nAUTH_SECRET=fixture-only\n`, { mode: 0o600 });
  return { root, database, envFile, uploadsDir: path.join(root, 'uploads') };
}

test('standalone preparation supplies assets and excludes generated env copies', async () => {
  const files = await fixture();
  try {
    await mkdir(path.join(files.root, '.next', 'standalone'), { recursive: true });
    await mkdir(path.join(files.root, '.next', 'static'), { recursive: true });
    await mkdir(path.join(files.root, 'public'));
    await writeFile(path.join(files.root, '.next', 'BUILD_ID'), 'fixture-build');
    await writeFile(path.join(files.root, '.next', 'standalone', 'server.js'), '// fixture');
    await writeFile(path.join(files.root, '.next', 'standalone', '.env'), 'DUMMY_SECRET=fixture-only');
    await writeFile(path.join(files.root, 'public', 'hero.svg'), '<svg/>');
    await writeFile(path.join(files.root, '.next', 'static', 'chunk.js'), '// chunk');
    const result = await prepareStandalone(files.root, { verifyNative: async () => ({ sqliteEntry: 'fixture/sqlite.js' }) });
    assert.equal(result.buildId, 'fixture-build');
    assert.deepEqual(result.removedEnvFiles, ['.env']);
    assert.equal(await readFile(path.join(files.root, '.next', 'standalone', 'public', 'hero.svg'), 'utf8'), '<svg/>');
    assert.equal(await readFile(path.join(files.root, '.next', 'standalone', '.next', 'static', 'chunk.js'), 'utf8'), '// chunk');
    await assert.rejects(stat(path.join(files.root, '.next', 'standalone', '.env')), { code: 'ENOENT' });
    assert.ok((await readFile(files.envFile, 'utf8')).includes('AUTH_SECRET=fixture-only'));
  } finally { await rm(files.root, { recursive: true, force: true }); }
});

test('standalone release refuses native modules built for another OS, architecture, Node ABI, or libc', () => {
  const identity = runtimeIdentity();
  assert.doesNotThrow(() => assertRuntimeCompatible(identity, identity));
  for (const [key, value] of [['platform', 'different-os'], ['arch', 'different-arch'], ['nodeAbi', '0'], ['libc', 'different-libc']]) {
    assert.throws(() => assertRuntimeCompatible({ ...identity, [key]: value }, identity), new RegExp(key));
  }
});

test('standalone native verification never falls back to dependencies outside the artifact', async () => {
  const files = await fixture();
  try {
    const standalone = path.join(files.root, '.next', 'standalone');
    await mkdir(standalone, { recursive: true });
    await writeFile(path.join(standalone, 'server.js'), '// fixture without packaged dependencies');
    await assert.rejects(verifyStandaloneNative(standalone), /native dependency is unusable/);
  } finally { await rm(files.root, { recursive: true, force: true }); }
});

test('standalone runtime loads explicit secrets, preserves injected env, resolves persistent paths', async () => {
  const files = await fixture();
  try {
    const configured = await runtimeEnvironment({ SUNFOOD_ENV_FILE: files.envFile, PORT: '3101', HOSTNAME: '127.0.0.1' });
    assert.equal(configured.PORT, '3101');
    assert.equal(configured.AUTH_SECRET, 'fixture-only');
    assert.equal(configured.DATABASE_URL, `file:${await realpath(files.database)}`);
    assert.equal(configured.UPLOAD_DIR, await realpath(files.uploadsDir));
    assert.equal(configured.NODE_ENV, 'production');
  } finally { await rm(files.root, { recursive: true, force: true }); }
});

test('standalone runtime fails closed for CWD-dependent data paths and missing databases', async () => {
  const files = await fixture();
  try {
    const env = { SUNFOOD_ENV_FILE: files.envFile, PORT: '3101', HOSTNAME: '127.0.0.1' };
    await assert.rejects(runtimeEnvironment({ ...env, DATABASE_URL: 'file:./prisma/dev.db' }), /absolute/);
    await assert.rejects(runtimeEnvironment({ ...env, DATABASE_URL: `file:${path.join(files.root, 'missing.sqlite')}` }), { code: 'ENOENT' });
    await assert.rejects(runtimeEnvironment({ ...env, UPLOAD_DIR: './storage/uploads' }), /absolute/);
    await assert.rejects(runtimeEnvironment({ ...env, HOSTNAME: '0.0.0.0' }), /loopback/);
    await assert.rejects(runtimeEnvironment({ ...env, PORT: '3000oops' }), /PORT/);
    await assert.rejects(runtimeEnvironment({ ...env, SUNFOOD_ENV_FILE: './.env' }), /absolute/);
    await assert.rejects(stat(path.join(files.root, 'missing.sqlite')), { code: 'ENOENT' });
  } finally { await rm(files.root, { recursive: true, force: true }); }
});

test('PM2 canary config keeps the worker disabled by default and loads its protected env file when enabled', async () => {
  const files = await fixture();
  const keys = ['SUNFOOD_RELEASE_DIR', 'SUNFOOD_ENV_FILE', 'SUNFOOD_PROCESS_NAME', 'SUNFOOD_ENABLE_WORKER', 'PORT'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const configPath = require.resolve('../deploy/ecosystem.config.cjs');
  try {
    Object.assign(process.env, {
      SUNFOOD_RELEASE_DIR: files.root,
      SUNFOOD_ENV_FILE: files.envFile,
      SUNFOOD_PROCESS_NAME: 'fixture-canary',
      PORT: '3099',
    });
    delete process.env.SUNFOOD_ENABLE_WORKER;
    delete require.cache[configPath];
    assert.equal(require(configPath).apps.length, 1);

    process.env.SUNFOOD_ENABLE_WORKER = 'true';
    delete require.cache[configPath];
    const config = require(configPath);
    assert.equal(config.apps.length, 2);
    assert.equal(config.apps[0].env.HOSTNAME, '127.0.0.1');
    assert.equal(config.apps[1].node_args[0], `--env-file=${files.envFile}`);
    assert.deepEqual(config.apps[1].node_args.slice(1), ['--import', 'tsx']);
    assert.equal(config.apps[1].env.DOTENV_CONFIG_PATH, files.envFile);
  } finally {
    delete require.cache[configPath];
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(files.root, { recursive: true, force: true });
  }
});

test('release backup restores a WAL snapshot, protects secrets and never overwrites an existing backup', async () => {
  const files = await fixture();
  const live = new Database(files.database);
  try {
    live.pragma('journal_mode = WAL');
    live.exec("INSERT INTO Supplier VALUES ('NCC-24')");
    await writeFile(path.join(files.uploadsDir, 'document.pdf'), 'fixture document');
    const destination = path.join(files.root, 'backup');
    const result = await backupRelease({ ...files, destination });
    assert.deepEqual(result.counts, { Supplier: 3 });
    const restored = new Database(path.join(destination, 'restore-verified.sqlite'), { readonly: true });
    try { assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM Supplier').get().count, 3); }
    finally { restored.close(); }
    const manifest = JSON.parse(await readFile(path.join(destination, 'backup-manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'verified');
    assert.equal(manifest.restoreVerified, true);
    assert.equal(manifest.uploads.length, 1);
    assert.equal(JSON.stringify(manifest).includes('fixture-only'), false);
    assert.equal(await readFile(path.join(destination, 'uploads', 'document.pdf'), 'utf8'), 'fixture document');
    assert.equal(await readFile(path.join(destination, 'runtime.env'), 'utf8'), await readFile(files.envFile, 'utf8'));
    if (process.platform !== 'win32') {
      assert.equal((await stat(path.join(destination, 'runtime.env'))).mode & 0o077, 0);
      assert.equal((await stat(destination)).mode & 0o077, 0);
    }
    await assert.rejects(backupRelease({ ...files, destination }), { code: 'EEXIST' });
    assert.equal(live.prepare('SELECT COUNT(*) AS count FROM Supplier').get().count, 3);
  } finally { live.close(); await rm(files.root, { recursive: true, force: true }); }
});
