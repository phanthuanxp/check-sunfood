ALTER TABLE "Batch" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "sourceSystem" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "Batch" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "Batch" ADD COLUMN "sourceSyncedAt" TIMESTAMP(3);
ALTER TABLE "Batch" ADD COLUMN "everPublished" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Batch" SET "everPublished" = true WHERE "isPublic" = true;
CREATE UNIQUE INDEX "Batch_sourceKey_key" ON "Batch"("sourceKey");
