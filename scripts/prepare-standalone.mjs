import { cp, lstat, mkdir, readFile, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isInside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function runtimeIdentity() {
  const report = process.report?.getReport();
  const glibc = report && typeof report === 'object' && 'header' in report
    ? report.header?.glibcVersionRuntime
    : undefined;
  return {
    platform: process.platform,
    arch: process.arch,
    nodeAbi: process.versions.modules,
    libc: process.platform === 'linux' ? (glibc ? 'glibc' : 'non-glibc') : 'not-applicable',
  };
}

export function assertRuntimeCompatible(built, current = runtimeIdentity()) {
  for (const key of ['platform', 'arch', 'nodeAbi', 'libc']) {
    if (!built || built[key] !== current[key]) {
      throw new Error(`Standalone runtime mismatch (${key}). Rebuild the release on the target OS/architecture with the same Node runtime.`);
    }
  }
}

export async function verifyStandaloneNative(standalone) {
  const resolvedRoot = await realpath(standalone);
  const standaloneRequire = createRequire(path.join(resolvedRoot, 'server.js'));
  let sqliteEntry;
  try {
    // Next bundles the Prisma adapter JavaScript into server chunks, while its
    // native dependency remains an external package. Requiring the adapter here
    // would incorrectly fall through to the checkout's parent node_modules.
    sqliteEntry = await realpath(standaloneRequire.resolve('better-sqlite3'));
    if (!isInside(resolvedRoot, sqliteEntry)) {
      throw new Error('dependency resolved outside the standalone artifact');
    }
    const Database = standaloneRequire('better-sqlite3');
    const database = new Database(':memory:');
    try {
      if (database.prepare('SELECT 1 AS ok').get().ok !== 1) throw new Error('native SQLite self-test returned an unexpected result');
    } finally {
      database.close();
    }
  } catch (error) {
    throw new Error(`Standalone SQLite native dependency is unusable: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return {
    sqliteEntry: path.relative(resolvedRoot, sqliteEntry).replaceAll(path.sep, '/'),
  };
}

export async function prepareStandalone(root = projectRoot, options = {}) {
  const standalone = path.join(root, '.next', 'standalone');
  const server = await lstat(path.join(standalone, 'server.js'));
  if (!server.isFile()) throw new Error('Standalone server missing. Run npm run build first.');
  const buildId = (await readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8')).trim();
  if (!buildId) throw new Error('Build ID missing.');
  for (const relative of ['public', '.next/static']) {
    const source = path.join(root, relative);
    if (!(await lstat(source)).isDirectory()) throw new Error(`Missing build assets: ${relative}`);
    const destination = path.join(standalone, relative);
    await rm(destination, { recursive: true, force: true });
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: true, dereference: false });
  }
  // Next may copy env files into its generated output. Runtime secrets belong
  // in a protected external env file, never in a transferable release artifact.
  const removedEnvFiles = [];
  const generatedEnvFiles = (await readdir(standalone)).filter(filename => filename === '.env' || filename.startsWith('.env.'));
  for (const filename of generatedEnvFiles) {
    const generatedFile = path.join(standalone, filename);
    try {
      const entry = await lstat(generatedFile);
      if (!entry.isFile() && !entry.isSymbolicLink()) throw new Error('Unexpected env directory in generated output.');
      await rm(generatedFile);
      removedEnvFiles.push(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const native = await (options.verifyNative || verifyStandaloneNative)(standalone);
  await writeFile(path.join(standalone, 'sunfood-release.json'), JSON.stringify({
    manifestVersion: 2,
    buildId,
    preparedAt: new Date().toISOString(),
    runtime: 'next-standalone',
    buildRuntime: runtimeIdentity(),
    native,
  }, null, 2) + '\n', { mode: 0o600 });
  return { buildId, removedEnvFiles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareStandalone().then(result => {
    console.log(`Standalone prepared (${result.buildId}); public/static copied; ${result.removedEnvFiles.length} generated env copies removed.`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
