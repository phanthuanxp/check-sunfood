import { spawn } from 'node:child_process';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertRuntimeCompatible, verifyStandaloneNative } from './prepare-standalone.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function runtimeEnvironment(input = process.env) {
  const env = { ...input };
  if (env.SUNFOOD_ENV_FILE) {
    if (!path.isAbsolute(env.SUNFOOD_ENV_FILE)) throw new Error('SUNFOOD_ENV_FILE must be absolute.');
    const info = await stat(env.SUNFOOD_ENV_FILE);
    if (!info.isFile()) throw new Error('SUNFOOD_ENV_FILE must be a file.');
    if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error('SUNFOOD_ENV_FILE permissions must be 600 or stricter.');
    const configured = parseEnv(await readFile(env.SUNFOOD_ENV_FILE, 'utf8'));
    for (const [key, value] of Object.entries(configured)) if (env[key] === undefined) env[key] = value;
  }
  env.NODE_ENV = 'production';
  const port = Number(env.PORT);
  if (!/^\d+$/.test(env.PORT || '') || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Set PORT explicitly to a free unprivileged port (1024-65535).');
  }
  // VPS hostnames often leak into inherited HOSTNAME. Require loopback here.
  env.HOSTNAME ||= '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(env.HOSTNAME)) throw new Error('HOSTNAME must be a loopback address behind Nginx.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (env.DATABASE_URL.startsWith('file:')) {
    const databasePath = env.DATABASE_URL.slice(5);
    if (!path.isAbsolute(databasePath) || databasePath.includes('?') || databasePath.includes('#')) {
      throw new Error('SQLite DATABASE_URL must be file: followed by an absolute filesystem path, without query/fragment.');
    }
    if (!(await stat(databasePath)).isFile()) throw new Error('SQLite database must already exist; startup never creates a new database.');
    // Resolve symlinks so moving the standalone CWD cannot redirect data.
    env.DATABASE_URL = `file:${await realpath(databasePath)}`;
  } else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    throw new Error('Unsupported DATABASE_URL scheme.');
  }
  if (!env.UPLOAD_DIR || !path.isAbsolute(env.UPLOAD_DIR) || !(await stat(env.UPLOAD_DIR)).isDirectory()) {
    throw new Error('UPLOAD_DIR must name an existing absolute persistent directory.');
  }
  env.UPLOAD_DIR = await realpath(env.UPLOAD_DIR);
  return env;
}

export async function startStandalone(root = projectRoot, input = process.env) {
  const env = await runtimeEnvironment(input);
  const standalone = path.join(root, '.next', 'standalone');
  const manifest = JSON.parse(await readFile(path.join(standalone, 'sunfood-release.json'), 'utf8'));
  if (manifest.manifestVersion !== 2 || manifest.runtime !== 'next-standalone') {
    throw new Error('Standalone release manifest is missing or unsupported. Run prepare:standalone again.');
  }
  assertRuntimeCompatible(manifest.buildRuntime);
  const buildId = (await readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8')).trim();
  if (manifest.buildId !== buildId) throw new Error('Standalone preparation is stale. Run prepare:standalone again.');
  await Promise.all(['server.js', 'public', '.next/static'].map(entry => access(path.join(standalone, entry))));
  await verifyStandaloneNative(standalone);
  const child = spawn(process.execPath, [path.join(standalone, 'server.js')], {
    cwd: standalone, env, stdio: 'inherit', windowsHide: true,
  });
  const forward = signal => { if (!child.killed) child.kill(signal); };
  const onTerm = () => forward('SIGTERM');
  const onInt = () => forward('SIGINT');
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);
  child.once('error', () => { console.error('Standalone process could not start.'); process.exitCode = 1; });
  child.once('exit', (code, signal) => {
    process.off('SIGTERM', onTerm);
    process.off('SIGINT', onInt);
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  return child;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startStandalone().catch(error => {
    // Do not print environment values or connection strings on startup failure.
    console.error(`Standalone startup refused: ${error.code || error.message}`);
    process.exitCode = 1;
  });
}
