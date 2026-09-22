import { createHash, createHmac, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getHanoiCheckCredentials, encryptHanoiCheckSecret, decryptHanoiCheckSecret, type HanoiCheckCredentials } from '@/lib/hanoicheck-settings';
import { HanoiCheckApiError } from '@/lib/hanoicheck-errors';

// Chuỗi ký = METHOD \n PATH(kèm /api, không có query) \n X-Timestamp \n X-Nonce \n SHA256_HEX(nội dung gửi lên)
// Chữ ký = Base64(HMAC_SHA256(chuỗi ký, hmac_secret)). GET không nội dung thì hash chuỗi rỗng.
export function buildCanonicalString(method: string, pathname: string, timestampSeconds: number, nonce: string, bodyBytes: string) {
  const bodyHash = createHash('sha256').update(bodyBytes, 'utf8').digest('hex');
  return [method.toUpperCase(), pathname, String(timestampSeconds), nonce, bodyHash].join('\n');
}

export function signHanoiCheckRequest(method: string, pathname: string, timestampSeconds: number, nonce: string, bodyBytes: string, hmacSecret: string) {
  const canonical = buildCanonicalString(method, pathname, timestampSeconds, nonce, bodyBytes);
  return createHmac('sha256', hmacSecret).update(canonical, 'utf8').digest('base64');
}

type TokenResponse = { token_type: string; expires_in: number; access_token: string; refresh_token: string };

async function requestTokenPair(creds: HanoiCheckCredentials, path: '/token' | '/refresh_token', body: Record<string, string>): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(`${creds.baseUrl.replace(/\/$/, '')}/api/supplier${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HanoiCheckApiError('Không kết nối được tới HanoiCheck. Kiểm tra mạng máy chủ.', 502);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token || !data?.refresh_token) {
    throw new HanoiCheckApiError(data?.message || `Không lấy được mã truy cập HanoiCheck (HTTP ${response.status}).`, response.status === 401 ? 401 : 502);
  }
  return data as TokenResponse;
}

async function persistTokens(data: TokenResponse) {
  await prisma.hanoiCheckIntegrationSettings.update({
    where: { id: 1 },
    data: {
      encryptedAccessToken: encryptHanoiCheckSecret(data.access_token),
      encryptedRefreshToken: encryptHanoiCheckSecret(data.refresh_token),
      accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
}

const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export async function ensureAccessToken(): Promise<{ accessToken: string; credentials: HanoiCheckCredentials }> {
  const credentials = await getHanoiCheckCredentials();
  if (!credentials) throw new HanoiCheckApiError('Chưa cấu hình đầy đủ Endpoint/Client ID/Client Secret/HMAC Secret trong Cài đặt HanoiCheck.', 503);
  const saved = await prisma.hanoiCheckIntegrationSettings.findUnique({ where: { id: 1 } });
  if (saved?.encryptedAccessToken && saved.accessTokenExpiresAt && saved.accessTokenExpiresAt.getTime() - Date.now() > EXPIRY_SAFETY_MARGIN_MS) {
    try { return { accessToken: decryptHanoiCheckSecret(saved.encryptedAccessToken), credentials }; } catch { /* fall through and reissue */ }
  }
  if (saved?.encryptedRefreshToken) {
    try {
      const refreshToken = decryptHanoiCheckSecret(saved.encryptedRefreshToken);
      const data = await requestTokenPair(credentials, '/refresh_token', { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: credentials.clientId, client_secret: credentials.clientSecret });
      await persistTokens(data);
      return { accessToken: data.access_token, credentials };
    } catch { /* refresh token may be expired/used; fall back to a fresh client_credentials grant */ }
  }
  const data = await requestTokenPair(credentials, '/token', { grant_type: 'client_credentials', client_id: credentials.clientId, client_secret: credentials.clientSecret });
  await persistTokens(data);
  return { accessToken: data.access_token, credentials };
}

export async function hcSignedRequest<T>(method: 'GET' | 'POST', path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const { accessToken, credentials } = await ensureAccessToken();
  const url = new URL(`${credentials.baseUrl.replace(/\/$/, '')}/api/supplier${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const signature = signHanoiCheckRequest(method, url.pathname, timestampSeconds, nonce, '', credentials.hmacSecret);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'X-Timestamp': String(timestampSeconds), 'X-Nonce': nonce, 'X-Signature': signature },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HanoiCheckApiError('Không kết nối được tới HanoiCheck. Kiểm tra mạng máy chủ.', 502);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new HanoiCheckApiError(data?.message || 'Mã truy cập hoặc chữ ký không hợp lệ.', 401);
    throw new HanoiCheckApiError(data?.message || `HanoiCheck trả về lỗi HTTP ${response.status}.`, response.status);
  }
  return data as T;
}
