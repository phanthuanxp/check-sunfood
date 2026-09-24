-- Pre-upgrade db:push layout. No _prisma_migrations history is assumed.
CREATE TABLE "Supplier" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL, "name" TEXT NOT NULL, "nameEn" TEXT,
  "productName" TEXT, "productNameEn" TEXT, "address" TEXT, "addressEn" TEXT,
  "taxCode" TEXT, "storage" TEXT, "storageEn" TEXT, "shelfLife" TEXT, "shelfLifeEn" TEXT,
  "sourceUrl" TEXT, "legacyDocsUrl" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING', "notes" TEXT, "notesEn" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");
CREATE INDEX "Supplier_code_idx" ON "Supplier"("code");
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
CREATE TABLE "Document" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "supplierId" INTEGER NOT NULL,
  "title" TEXT NOT NULL, "titleEn" TEXT, "category" TEXT NOT NULL DEFAULT 'OTHER',
  "fileUrl" TEXT NOT NULL, "issuedAt" DATETIME, "expiresAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'VALID', "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Document_supplierId_idx" ON "Document"("supplierId");
CREATE INDEX "Document_expiresAt_idx" ON "Document"("expiresAt");
CREATE TABLE "DocumentVersion" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "documentId" INTEGER NOT NULL,
  "fileUrl" TEXT NOT NULL, "note" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");
CREATE TABLE "AuditLog" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "supplierId" INTEGER,
  "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT, "summary" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_supplierId_idx" ON "AuditLog"("supplierId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE "ImportDraft" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "code" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL, "payload" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" DATETIME, "reviewNotes" TEXT
);
CREATE INDEX "ImportDraft_code_fetchedAt_idx" ON "ImportDraft"("code", "fetchedAt");
CREATE TABLE "AiIntegrationSettings" (
  "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1, "encryptedApiKey" TEXT,
  "documentModel" TEXT NOT NULL DEFAULT 'gpt-5.6-terra', "helperModel" TEXT NOT NULL DEFAULT 'gpt-5.6-luna',
  "publicQaEnabled" BOOLEAN NOT NULL DEFAULT false, "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "HanoiCheckIntegrationSettings" (
  "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1, "baseUrl" TEXT, "traceConnectionCode" TEXT,
  "encryptedClientId" TEXT, "encryptedClientSecret" TEXT, "encryptedHmacSecret" TEXT,
  "encryptedAccessToken" TEXT, "encryptedRefreshToken" TEXT, "accessTokenExpiresAt" DATETIME,
  "lastSyncedAt" DATETIME, "lastSyncStatus" TEXT, "lastSyncCount" INTEGER, "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Product" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "supplierId" INTEGER NOT NULL,
  "name" TEXT NOT NULL, "sku" TEXT, "gtin" TEXT, "origin" TEXT, "unit" TEXT, "storage" TEXT,
  "hygieneCertNumber" TEXT, "isPublic" BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Product_supplierId_sku_key" ON "Product"("supplierId", "sku");
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");
CREATE TABLE "Batch" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "publicId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL, "code" TEXT NOT NULL, "name" TEXT,
  "receivedAt" DATETIME, "producedAt" DATETIME, "expiresAt" DATETIME,
  "sourceSystem" TEXT NOT NULL DEFAULT 'LOCAL', "sourceKey" TEXT, "sourceSyncedAt" DATETIME,
  "sourceTraceUrl" TEXT, "sourcePayload" TEXT, "everPublished" BOOLEAN NOT NULL DEFAULT false,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Batch_publicId_key" ON "Batch"("publicId");
CREATE UNIQUE INDEX "Batch_sourceKey_key" ON "Batch"("sourceKey");
CREATE UNIQUE INDEX "Batch_productId_code_key" ON "Batch"("productId", "code");
CREATE TABLE "TraceEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "batchId" INTEGER NOT NULL,
  "occurredAt" DATETIME NOT NULL, "stage" TEXT NOT NULL, "title" TEXT NOT NULL,
  "details" TEXT, "location" TEXT, "isPublic" BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TraceEvent_batchId_occurredAt_idx" ON "TraceEvent"("batchId", "occurredAt");
