CREATE TABLE "AiIntegrationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "encryptedApiKey" TEXT,
    "documentModel" TEXT NOT NULL DEFAULT 'gpt-5.6-terra',
    "helperModel" TEXT NOT NULL DEFAULT 'gpt-5.6-luna',
    "publicQaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiIntegrationSettings_pkey" PRIMARY KEY ("id")
);
