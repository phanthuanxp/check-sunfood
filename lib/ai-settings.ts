import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export const AI_MODELS = ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-6-astra'] as const;
export type AiModel = (typeof AI_MODELS)[number];

export function isAiModel(value: unknown): value is AiModel {
  return typeof value === 'string' && AI_MODELS.includes(value as AiModel);
}

function encryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.startsWith('replace-')) throw new Error('AI_ENCRYPTION_KEY_NOT_CONFIGURED');
  return createHash('sha256').update('check-sunfood:ai-integration:v1\0').update(secret).digest();
}

export function canEncryptAiKey() {
  try { encryptionKey(); return true; } catch { return false; }
}

export function encryptAiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptAiKey(value: string) {
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('AI_ENCRYPTED_KEY_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export async function getAiRuntimeSettings() {
  const saved = await prisma.aiIntegrationSettings.findUnique({ where: { id: 1 } });
  const environmentKey = process.env.OPENAI_API_KEY?.trim() || '';
  let keyError = false;
  let apiKey = environmentKey;
  if (saved?.encryptedApiKey) {
    try { apiKey = decryptAiKey(saved.encryptedApiKey); }
    catch { apiKey = ''; keyError = true; }
  }
  const documentModel = saved?.documentModel || (isAiModel(process.env.OPENAI_DOCUMENT_MODEL) ? process.env.OPENAI_DOCUMENT_MODEL : 'gpt-5.6-terra');
  const helperModel = saved?.helperModel || (isAiModel(process.env.OPENAI_QA_MODEL) ? process.env.OPENAI_QA_MODEL : 'gpt-5.6-luna');
  return {
    apiKey,
    documentModel,
    helperModel,
    publicQaEnabled: saved?.publicQaEnabled ?? process.env.AI_PUBLIC_QA_ENABLED === 'true',
    keySource: saved?.encryptedApiKey ? 'admin' : environmentKey ? 'environment' : 'none',
    keyError,
    canEncrypt: canEncryptAiKey(),
    updatedAt: saved?.updatedAt ?? null,
  };
}
