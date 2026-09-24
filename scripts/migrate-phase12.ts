import { createHash } from 'node:crypto';
import { chmodSync, closeSync, existsSync, openSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type BetterSqlite3 from 'better-sqlite3';

// better-sqlite3 is the Prisma adapter's native runtime dependency. Resolve it
// from that package instead of relying on npm hoisting a transitive dependency.
const projectRequire = createRequire(import.meta.url);
const adapterRequire = createRequire(projectRequire.resolve('@prisma/adapter-better-sqlite3'));
const Database = adapterRequire('better-sqlite3') as typeof BetterSqlite3;

type Sqlite = InstanceType<typeof Database>;
type Column = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };
type Fingerprint = { columns: Column[]; count: number; digest: string };
type Snapshot = Record<string, Fingerprint>;
type Change = { label: string; sql: string };

// This is an explicit upgrade of the pre-Phase-1+2 db:push schema, not a Prisma
// migration-history baseline. All pre-existing rows and their IDs stay intact.
const BASE_COLUMNS: Record<string, string[]> = {
  Supplier: 'id code name nameEn productName productNameEn address addressEn taxCode storage storageEn shelfLife shelfLifeEn sourceUrl legacyDocsUrl status verificationStatus notes notesEn createdAt updatedAt'.split(' '),
  Document: 'id supplierId title titleEn category fileUrl issuedAt expiresAt status isPublic createdAt updatedAt'.split(' '),
  DocumentVersion: 'id documentId fileUrl note createdAt'.split(' '),
  AuditLog: 'id supplierId action entity entityId summary createdAt'.split(' '),
  ImportDraft: 'id code sourceUrl sourceHash payload status fetchedAt reviewedAt reviewNotes'.split(' '),
  AiIntegrationSettings: 'id encryptedApiKey documentModel helperModel publicQaEnabled updatedAt'.split(' '),
  HanoiCheckIntegrationSettings: 'id baseUrl traceConnectionCode encryptedClientId encryptedClientSecret encryptedHmacSecret encryptedAccessToken encryptedRefreshToken accessTokenExpiresAt lastSyncedAt lastSyncStatus lastSyncCount updatedAt'.split(' '),
  Product: 'id supplierId name sku gtin origin unit storage hygieneCertNumber isPublic'.split(' '),
  Batch: 'id publicId productId code name receivedAt producedAt expiresAt sourceSystem sourceKey sourceSyncedAt sourceTraceUrl sourcePayload everPublished isPublic'.split(' '),
  TraceEvent: 'id batchId occurredAt stage title details location isPublic'.split(' '),
};

const ADDITIONS = [
  ['Supplier', 'phone', 'TEXT'],
  ['Supplier', 'website', 'TEXT'],
  ['Supplier', 'email', 'TEXT'],
  ['Supplier', 'description', 'TEXT'],
  ['Supplier', 'descriptionEn', 'TEXT'],
  ['Product', 'imageUrl', 'TEXT'],
  ['Batch', 'sourcePayloadHash', 'TEXT'],
  ['Batch', 'sourceVerified', 'BOOLEAN'],
  ['Batch', 'sourceReviewStatus', "TEXT NOT NULL DEFAULT 'LEGACY'"],
  ['TraceEvent', 'sourceKey', 'TEXT'],
] as const;

const TABLES: Record<string, string> = {
  HanoiCheckSupplierMapping: `CREATE TABLE "HanoiCheckSupplierMapping" (
    "externalCode" TEXT NOT NULL PRIMARY KEY,
    "supplierId" INTEGER NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HanoiCheckSupplierMapping_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  HanoiCheckSnapshot: `CREATE TABLE "HanoiCheckSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "rawHtml" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "batchId" INTEGER,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "HanoiCheckSnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  HanoiCheckSyncJob: `CREATE TABLE "HanoiCheckSyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
  )`,
  IntegrationLease: `CREATE TABLE "IntegrationLease" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
  )`,
};

const INDEXES = [
  { table: 'TraceEvent', name: 'TraceEvent_batchId_sourceKey_key', columns: ['batchId', 'sourceKey'], unique: true },
  { table: 'HanoiCheckSnapshot', name: 'HanoiCheckSnapshot_sourceKey_payloadHash_key', columns: ['sourceKey', 'payloadHash'], unique: true },
  { table: 'HanoiCheckSnapshot', name: 'HanoiCheckSnapshot_status_fetchedAt_idx', columns: ['status', 'fetchedAt'], unique: false },
  { table: 'HanoiCheckSyncJob', name: 'HanoiCheckSyncJob_status_createdAt_idx', columns: ['status', 'createdAt'], unique: false },
];

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function columns(db: Sqlite, table: string): Column[] {
  return (db.prepare(`PRAGMA table_info(${quote(table)})`).all() as Column[]).map(({ name, type, notnull, dflt_value, pk }) => ({ name, type, notnull, dflt_value, pk }));
}

function tableNames(db: Sqlite): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
}

function ensureIntegrity(db: Sqlite): void {
  const rows = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok') throw new Error('SQLite integrity_check failed; no automatic repair is attempted.');
  if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('SQLite has foreign-key violations; reconcile them before this upgrade.');
}

function fingerprint(db: Sqlite, table: string, projection = columns(db, table)): Fingerprint {
  // A sorted multiset also handles tables without a primary key and duplicate rows.
  // Values are hashed in memory and never printed, including encrypted settings.
  const hashes: string[] = [];
  const statement = db.prepare(`SELECT ${projection.map((column) => quote(column.name)).join(', ')} FROM ${quote(table)}`).raw().safeIntegers();
  for (const row of statement.iterate() as Iterable<unknown[]>) {
    const encoded = row.map((value) => {
      if (typeof value === 'bigint') return ['integer', value.toString()];
      if (Buffer.isBuffer(value)) return ['blob', value.toString('base64')];
      return [typeof value, value];
    });
    hashes.push(createHash('sha256').update(JSON.stringify(encoded)).digest('hex'));
  }
  hashes.sort();
  return { columns: projection, count: hashes.length, digest: createHash('sha256').update(hashes.join('\n')).digest('hex') };
}

function snapshot(db: Sqlite): Snapshot {
  return Object.fromEntries(tableNames(db).map((table) => [table, fingerprint(db, table)]));
}

function assertPreserved(db: Sqlite, before: Snapshot, allowAdditions: boolean): void {
  const names = tableNames(db);
  if (!allowAdditions && JSON.stringify(names) !== JSON.stringify(Object.keys(before))) {
    throw new Error('Schema changed since the backup; pause all writers and retry with a fresh backup.');
  }
  for (const [table, expected] of Object.entries(before)) {
    const nowColumns = columns(db, table);
    const originalColumns = nowColumns.filter((column) => expected.columns.some((item) => item.name === column.name));
    if (JSON.stringify(originalColumns) !== JSON.stringify(expected.columns) || (!allowAdditions && nowColumns.length !== expected.columns.length)) {
      throw new Error(`Original column definition changed for ${table}; migration stopped.`);
    }
    const actual = fingerprint(db, table, expected.columns);
    if (actual.count !== expected.count || actual.digest !== expected.digest) {
      throw new Error(`Existing data changed in ${table}; migration stopped. Pause all writers and use a fresh backup.`);
    }
  }
}

function planUpgrade(db: Sqlite): Change[] {
  for (const [table, required] of Object.entries(BASE_COLUMNS)) {
    const present = new Set(columns(db, table).map((column) => column.name));
    if (required.some((column) => !present.has(column))) {
      throw new Error(`Unsupported starting schema: ${table} is missing required pre-Phase-1+2 columns. This tool never creates or replaces base tables.`);
    }
  }
  const expected = new Database(':memory:');
  const plan: Change[] = [];
  try {
    for (const [table, name, definition] of ADDITIONS) {
      const present = columns(db, table).find((column) => column.name === name);
      if (!present) {
        plan.push({ label: `Add ${table}.${name}`, sql: `ALTER TABLE ${quote(table)} ADD COLUMN ${quote(name)} ${definition}` });
      } else {
        expected.exec(`CREATE TABLE "ExpectedColumn" (${quote(name)} ${definition})`);
        const desired = columns(expected, 'ExpectedColumn')[0];
        expected.exec('DROP TABLE "ExpectedColumn"');
        if (JSON.stringify(present) !== JSON.stringify(desired)) throw new Error(`Conflicting column definition: ${table}.${name}. Reconcile explicitly before upgrading.`);
      }
    }
    for (const [table, sql] of Object.entries(TABLES)) {
      expected.exec(sql);
      const actual = columns(db, table);
      if (actual.length === 0) {
        plan.push({ label: `Create ${table}`, sql });
      } else {
        if (JSON.stringify(actual) !== JSON.stringify(columns(expected, table))) throw new Error(`Conflicting existing table: ${table}.`);
        const fkSql = `PRAGMA foreign_key_list(${quote(table)})`;
        if (JSON.stringify(db.prepare(fkSql).all()) !== JSON.stringify(expected.prepare(fkSql).all())) throw new Error(`Conflicting foreign keys: ${table}.`);
      }
    }
    for (const index of INDEXES) {
      const existing = (db.prepare(`PRAGMA index_list(${quote(index.table)})`).all() as { name: string; unique: number; partial: number }[]).find((item) => item.name === index.name);
      if (existing) {
        const keys = (db.prepare(`PRAGMA index_info(${quote(index.name)})`).all() as { name: string }[]).map((item) => item.name);
        if (existing.unique !== Number(index.unique) || existing.partial !== 0 || JSON.stringify(keys) !== JSON.stringify(index.columns)) throw new Error(`Conflicting existing index: ${index.name}.`);
      } else {
        plan.push({ label: `Create index ${index.name}`, sql: `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(index.name)} ON ${quote(index.table)} (${index.columns.map(quote).join(', ')})` });
      }
    }
    return plan;
  } finally {
    expected.close();
  }
}

function validateDatabasePath(databasePath: string): string {
  if (!isAbsolute(databasePath)) throw new Error('--database must be an explicit absolute SQLite file path.');
  if (!existsSync(databasePath) || !statSync(databasePath).isFile()) throw new Error('--database must refer to an existing regular SQLite file; no database will be created.');
  return realpathSync(databasePath);
}

function validateBackupPath(backupPath: string | undefined, databasePath: string): string {
  if (!backupPath || !isAbsolute(backupPath)) throw new Error('--apply requires --backup with an absolute path to a new backup file.');
  const result = resolve(realpathSync(dirname(backupPath)), backupPath.split(/[\\/]/).at(-1)!);
  if (!statSync(dirname(result)).isDirectory() || result === databasePath || existsSync(result)) throw new Error('Backup destination must be a new file in an existing directory; backups are never overwritten.');
  return result;
}

export type MigrationOptions = { databasePath: string; apply?: boolean; backupPath?: string };
export type MigrationReport = {
  status: 'dry-run' | 'applied' | 'unchanged';
  databasePath: string;
  backupPath?: string;
  changes: string[];
  originalCounts: Record<string, number>;
  integrity: 'ok';
  existingRowsPreserved: boolean;
};

export async function migratePhase12(options: MigrationOptions): Promise<MigrationReport> {
  const databasePath = validateDatabasePath(options.databasePath);
  const backupPath = options.apply ? validateBackupPath(options.backupPath, databasePath) : undefined;
  const db = new Database(databasePath, { readonly: !options.apply, fileMustExist: true, timeout: 5000 });
  try {
    db.pragma('foreign_keys = ON');
    ensureIntegrity(db);
    const changes = planUpgrade(db);
    const original = snapshot(db);
    const report: MigrationReport = {
      status: options.apply ? 'unchanged' : 'dry-run', databasePath,
      changes: changes.map((change) => change.label),
      originalCounts: Object.fromEntries(Object.entries(original).map(([table, value]) => [table, value.count])),
      integrity: 'ok', existingRowsPreserved: true,
    };
    if (!options.apply || changes.length === 0) return report;

    // Reserve with exclusive creation and restrictive permissions before copying.
    // The online SQLite backup API includes committed WAL data.
    closeSync(openSync(backupPath!, 'wx', 0o600));
    await db.backup(backupPath!);
    chmodSync(backupPath!, 0o600);
    const backup = new Database(backupPath!, { readonly: true, fileMustExist: true });
    let before: Snapshot;
    try {
      ensureIntegrity(backup);
      before = snapshot(backup);
      assertPreserved(backup, original, false);
    } finally {
      backup.close();
    }

    // Acquire the write lock before rechecking the snapshot. Any writes between
    // preflight/backup/lock acquisition cause an abort, never a stale restore.
    db.exec('BEGIN IMMEDIATE');
    try {
      assertPreserved(db, before!, false);
      const lockedPlan = planUpgrade(db);
      for (const change of lockedPlan) db.exec(change.sql);
      assertPreserved(db, before!, true);
      ensureIntegrity(db);
      if (planUpgrade(db).length !== 0) throw new Error('Post-migration schema verification failed.');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { ...report, status: 'applied', backupPath };
  } finally {
    db.close();
  }
}

export function parseMigrationArgs(args: string[]): MigrationOptions {
  let databasePath: string | undefined;
  let backupPath: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--apply' && !apply) apply = true;
    else if (arg === '--database' && !databasePath && args[index + 1] && !args[index + 1].startsWith('--')) databasePath = args[++index];
    else if (arg === '--backup' && !backupPath && args[index + 1] && !args[index + 1].startsWith('--')) backupPath = args[++index];
    else throw new Error('Unknown, duplicate, or incomplete argument. Usage: --database ABSOLUTE_DB [--apply --backup ABSOLUTE_NEW_BACKUP]');
  }
  if (!databasePath) throw new Error('Required: --database ABSOLUTE_DB. Default is read-only dry-run.');
  if (backupPath && !apply) throw new Error('--backup is only accepted with --apply.');
  return { databasePath, apply, backupPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  Promise.resolve().then(() => migratePhase12(parseMigrationArgs(process.argv.slice(2))))
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`Phase 1+2 upgrade stopped: ${error instanceof Error ? error.message : 'Unknown migration error'}\n`);
      process.exitCode = 1;
    });
}
