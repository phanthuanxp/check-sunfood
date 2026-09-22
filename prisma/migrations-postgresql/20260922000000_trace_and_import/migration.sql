CREATE TABLE "ImportDraft" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "gtin" TEXT,
    "origin" TEXT,
    "unit" TEXT,
    "storage" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Batch" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "producedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TraceEvent" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "stage" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "location" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TraceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportDraft_code_fetchedAt_idx" ON "ImportDraft"("code", "fetchedAt");
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");
CREATE UNIQUE INDEX "Batch_productId_code_key" ON "Batch"("productId", "code");
CREATE UNIQUE INDEX "Batch_publicId_key" ON "Batch"("publicId");
CREATE INDEX "TraceEvent_batchId_occurredAt_idx" ON "TraceEvent"("batchId", "occurredAt");

ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TraceEvent" ADD CONSTRAINT "TraceEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
