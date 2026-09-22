import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export const DEFAULT_BASE_URL = 'https://ncc-api.hanoicheck.com.vn';

function encryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.startsWith('replace-')) throw new Error('HANOICHECK_ENCRYPTION_KEY_NOT_CONFIGURED');
  return createHash('sha256').update('check-sunfood:hanoicheck-integration:v2\0').update(secret).digest();
}

export function canEncryptHanoiCheckSecret() {
  try { encryptionKey(); return true; } catch { return false; }
}

export function encryptHanoiCheckSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptHanoiCheckSecret(value: string) {
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('HANOICHECK_ENCRYPTED_SECRET_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export type HanoiCheckCredentials = { baseUrl: string; traceConnectionCode: string; clientId: string; clientSecret: string; hmacSecret: string };

export async function getHanoiCheckCredentials(): Promise<HanoiCheckCredentials | null> {
  const saved = await prisma.hanoiCheckIntegrationSettings.findUnique({ where: { id: 1 } });
  if (!saved?.encryptedClientId || !saved.encryptedClientSecret || !saved.encryptedHmacSecret || !saved.traceConnectionCode) return null;
  try {
    return {
      baseUrl: saved.baseUrl || DEFAULT_BASE_URL,
      traceConnectionCode: saved.traceConnectionCode,
      clientId: decryptHanoiCheckSecret(saved.encryptedClientId),
      clientSecret: decryptHanoiCheckSecret(saved.encryptedClientSecret),
      hmacSecret: decryptHanoiCheckSecret(saved.encryptedHmacSecret),
    };
  } catch { return null; }
}

export async function getHanoiCheckStatus() {
  const saved = await prisma.hanoiCheckIntegrationSettings.findUnique({ where: { id: 1 } });
  let credentialsError = false;
  if (saved?.encryptedClientId || saved?.encryptedClientSecret || saved?.encryptedHmacSecret) {
    try {
      if (saved.encryptedClientId) decryptHanoiCheckSecret(saved.encryptedClientId);
      if (saved.encryptedClientSecret) decryptHanoiCheckSecret(saved.encryptedClientSecret);
      if (saved.encryptedHmacSecret) decryptHanoiCheckSecret(saved.encryptedHmacSecret);
    } catch { credentialsError = true; }
  }
  return {
    hasCredentials: Boolean(saved?.encryptedClientId && saved?.encryptedClientSecret && saved?.encryptedHmacSecret && saved?.traceConnectionCode),
    credentialsError,
    canEncrypt: canEncryptHanoiCheckSecret(),
    baseUrl: saved?.baseUrl || DEFAULT_BASE_URL,
    traceConnectionCode: saved?.traceConnectionCode || '',
    hasAccessToken: Boolean(saved?.encryptedAccessToken),
    accessTokenExpiresAt: saved?.accessTokenExpiresAt ?? null,
    lastSyncedAt: saved?.lastSyncedAt ?? null,
    lastSyncStatus: saved?.lastSyncStatus ?? null,
    lastSyncCount: saved?.lastSyncCount ?? null,
    updatedAt: saved?.updatedAt ?? null,
  };
}
