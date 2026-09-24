import { createHash, createHmac, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { decodeHanoiCheckCredentials, encryptHanoiCheckSecret, decryptHanoiCheckSecret, type HanoiCheckCredentials } from '@/lib/hanoicheck-settings';
import { HanoiCheckApiError } from '@/lib/hanoicheck-errors';
import { hanoiCheckBusinessUrl, normalizeHanoiCheckEndpoint } from '@/lib/hanoicheck-endpoint';
import { acquireIntegrationLease, releaseIntegrationLease } from '@/lib/integration-lease';

// HanoiCheck signs PATH including /api, excluding query parameters; an empty GET body is hashed.
export function buildCanonicalString(method: string, pathname: string, timestampSeconds: number, nonce: string, bodyBytes: string) {
  const bodyHash = createHash('sha256').update(bodyBytes, 'utf8').digest('hex');
  return [method.toUpperCase(), pathname, String(timestampSeconds), nonce, bodyHash].join('\n');
}

export function signHanoiCheckRequest(method: string, pathname: string, timestampSeconds: number, nonce: string, bodyBytes: string, hmacSecret: string) {
  return createHmac('sha256', hmacSecret).update(buildCanonicalString(method, pathname, timestampSeconds, nonce, bodyBytes), 'utf8').digest('base64');
}

type TokenResponse = { expires_in: number; access_token: string; refresh_token: string };
export type HanoiCheckTokenSnapshot = {
  configurationId: string;
  credentials: HanoiCheckCredentials;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
};

export type HanoiCheckTokenStore = {
  read(): Promise<HanoiCheckTokenSnapshot | null>;
  save(snapshot: HanoiCheckTokenSnapshot, tokens: TokenResponse): Promise<boolean>;
  invalidate(snapshot: HanoiCheckTokenSnapshot): Promise<void>;
  exclusive(work: () => Promise<void>): Promise<void>;
};

const EXPIRY_SAFETY_MARGIN_MS = 60_000;
const TOKEN_LEASE_KEY = 'hanoicheck-token-refresh';
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const noCredentials = () => new HanoiCheckApiError('Chưa cấu hình hợp lệ Endpoint/Client ID/Client Secret/HMAC Secret và mã kết nối trong Cài đặt HanoiCheck.', 503);
const upstreamError = (status: number) => new HanoiCheckApiError(
  status === 401 || status === 403
    ? 'HanoiCheck từ chối thông tin xác thực hoặc chữ ký. Kiểm tra cấu hình và đồng hồ máy chủ.'
    : `Không đọc được dữ liệu HanoiCheck (HTTP ${status}). Vui lòng thử lại sau.`,
  status === 401 ? 401 : 502,
);

async function readJson(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new HanoiCheckApiError('HanoiCheck trả về dữ liệu trống.', 502);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new HanoiCheckApiError('Dữ liệu trả về từ HanoiCheck không hợp lệ hoặc vượt giới hạn.', 502);
  } finally { reader.releaseLock(); }
}

/** Dependencies are injectable so transport and concurrency tests never contact the vendor. */
export function createHanoiCheckClient(store: HanoiCheckTokenStore, options: {
  fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; nonce?: () => string;
} = {}) {
  const request = options.fetch ?? fetch;
  const sleep = options.sleep ?? pause;
  const now = options.now ?? Date.now;
  const nonce = options.nonce ?? randomUUID;
  let tokenFlight: Promise<void> | undefined;
  const valid = (snapshot: HanoiCheckTokenSnapshot) => Boolean(snapshot.accessToken && snapshot.expiresAt && snapshot.expiresAt - now() > EXPIRY_SAFETY_MARGIN_MS);

  async function tokenPair(snapshot: HanoiCheckTokenSnapshot, refreshing: boolean): Promise<TokenResponse> {
    const credentials = snapshot.credentials;
    const endpoint = normalizeHanoiCheckEndpoint(credentials.baseUrl);
    const body = refreshing
      ? { grant_type: 'refresh_token', refresh_token: snapshot.refreshToken!, client_id: credentials.clientId, client_secret: credentials.clientSecret }
      : { grant_type: 'client_credentials', client_id: credentials.clientId, client_secret: credentials.clientSecret };
    // Rotating refresh grants cannot safely be retried after an ambiguous network failure.
    const attempts = refreshing ? 1 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response: Response;
      try {
        response = await request(`${endpoint}/api/supplier/${refreshing ? 'refresh_token' : 'token'}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body), cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000),
        });
      } catch {
        if (attempt + 1 < attempts) { await sleep(250); continue; }
        throw new HanoiCheckApiError('Không kết nối được tới HanoiCheck. Kiểm tra mạng máy chủ.', 502);
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (TRANSIENT_STATUS.has(response.status) && attempt + 1 < attempts) { await sleep(250); continue; }
        throw upstreamError(response.status);
      }
      const data = await readJson(response, 64 * 1024) as Partial<TokenResponse> | null;
      if (!data || typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 16_384 ||
          typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 16_384 ||
          typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 60 || data.expires_in > 86_400) {
        throw new HanoiCheckApiError('HanoiCheck trả về mã truy cập không hợp lệ.', 502);
      }
      return data as TokenResponse;
    }
    throw new HanoiCheckApiError('Không lấy được mã truy cập HanoiCheck.', 502);
  }

  async function authenticatedSnapshot() {
    for (let pass = 0; pass < 3; pass++) {
      const snapshot = await store.read();
      if (!snapshot) throw noCredentials();
      normalizeHanoiCheckEndpoint(snapshot.credentials.baseUrl);
      if (valid(snapshot)) return snapshot;
      if (!tokenFlight) {
        tokenFlight = store.exclusive(async () => {
          // Another process may have refreshed while this process was waiting for the lease.
          const current = await store.read();
          if (!current) throw noCredentials();
          if (valid(current)) return;
          let tokens: TokenResponse | undefined;
          if (current.refreshToken) {
            try { tokens = await tokenPair(current, true); } catch { /* Reissue once via client credentials. */ }
          }
          // A credentials change must not trigger a grant against an obsolete account.
          if ((await store.read())?.configurationId !== current.configurationId) return;
          tokens ??= await tokenPair(current, false);
          await store.save(current, tokens); // CAS rejects results from settings changed in flight.
        }).finally(() => { tokenFlight = undefined; });
      }
      await tokenFlight;
      // Always reload after single-flight completion; never return a cached credentials/token pair.
    }
    throw new HanoiCheckApiError('Cấu hình HanoiCheck vừa thay đổi hoặc đang được cập nhật. Vui lòng thử lại.', 503);
  }

  async function ensureAccessToken() {
    const snapshot = await authenticatedSnapshot();
    return { accessToken: snapshot.accessToken!, credentials: snapshot.credentials };
  }

  async function hcSignedRequest<T>(method: 'GET', path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    if (method !== 'GET') throw new HanoiCheckApiError('Check Sunfood chỉ được đọc dữ liệu nghiệp vụ HanoiCheck.', 405);
    let reauthenticated = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await authenticatedSnapshot();
      const url = hanoiCheckBusinessUrl(snapshot.credentials.baseUrl, path, params);
      const timestampSeconds = Math.floor(now() / 1000);
      const requestNonce = nonce();
      const signature = signHanoiCheckRequest('GET', url.pathname, timestampSeconds, requestNonce, '', snapshot.credentials.hmacSecret);
      let response: Response;
      try {
        response = await request(url, {
          method: 'GET', headers: { Authorization: `Bearer ${snapshot.accessToken}`, Accept: 'application/json', 'X-Timestamp': String(timestampSeconds), 'X-Nonce': requestNonce, 'X-Signature': signature },
          cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000),
        });
      } catch {
        if (attempt < 2) { await sleep(250 * 2 ** attempt); continue; }
        throw new HanoiCheckApiError('Không kết nối được tới HanoiCheck. Kiểm tra mạng máy chủ.', 502);
      }
      if (response.ok) return await readJson(response, 2 * 1024 * 1024) as T;
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 && !reauthenticated && attempt < 2) {
        reauthenticated = true;
        await store.invalidate(snapshot);
        continue;
      }
      if (TRANSIENT_STATUS.has(response.status) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Math.min(2_000, Math.max(250 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)));
        continue;
      }
      throw upstreamError(response.status);
    }
    throw new HanoiCheckApiError('Đọc HanoiCheck vượt số lần thử cho phép.', 502);
  }
  return { ensureAccessToken, hcSignedRequest };
}

type SettingsRecord = NonNullable<Awaited<ReturnType<typeof prisma.hanoiCheckIntegrationSettings.findUnique>>>;
function configurationWhere(saved: SettingsRecord) {
  return { id: 1, baseUrl: saved.baseUrl, traceConnectionCode: saved.traceConnectionCode, encryptedClientId: saved.encryptedClientId, encryptedClientSecret: saved.encryptedClientSecret, encryptedHmacSecret: saved.encryptedHmacSecret };
}
function configurationId(saved: SettingsRecord) {
  return createHash('sha256').update(JSON.stringify(configurationWhere(saved))).digest('hex');
}
function decryptedToken(value: string | null) {
  if (!value) return null;
  try { return decryptHanoiCheckSecret(value); } catch { return null; }
}

function databaseTokenStore(): HanoiCheckTokenStore {
  let leaseOwner: string | undefined;
  return {
    async read() {
      const saved = await prisma.hanoiCheckIntegrationSettings.findUnique({ where: { id: 1 } });
      const credentials = decodeHanoiCheckCredentials(saved);
      return saved && credentials ? {
        configurationId: configurationId(saved), credentials,
        accessToken: decryptedToken(saved.encryptedAccessToken), refreshToken: decryptedToken(saved.encryptedRefreshToken),
        expiresAt: saved.accessTokenExpiresAt?.getTime() ?? null,
      } : null;
    },
    async save(snapshot, tokens) {
      return prisma.$transaction(async tx => {
        const lease = await tx.integrationLease.findUnique({ where: { key: TOKEN_LEASE_KEY } });
        if (!leaseOwner || lease?.owner !== leaseOwner || lease.expiresAt.getTime() <= Date.now()) return false;
        const current = await tx.hanoiCheckIntegrationSettings.findUnique({ where: { id: 1 } });
        if (!current || configurationId(current) !== snapshot.configurationId) return false;
        const result = await tx.hanoiCheckIntegrationSettings.updateMany({
          where: configurationWhere(current),
          data: { encryptedAccessToken: encryptHanoiCheckSecret(tokens.access_token), encryptedRefreshToken: encryptHanoiCheckSecret(tokens.refresh_token), accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000) },
        });
        return result.count === 1;
      });
    },
    async invalidate(snapshot) {
      const current = await prisma.hanoiCheckIntegrationSettings.findUnique({ where: { id: 1 } });
      if (!current || configurationId(current) !== snapshot.configurationId || decryptedToken(current.encryptedAccessToken) !== snapshot.accessToken) return;
      await prisma.hanoiCheckIntegrationSettings.updateMany({
        where: { ...configurationWhere(current), encryptedAccessToken: current.encryptedAccessToken },
        data: { encryptedAccessToken: null, accessTokenExpiresAt: null },
      });
    },
    async exclusive(work) {
      const owner = randomUUID();
      const deadline = Date.now() + 25_000;
      while (!(await acquireIntegrationLease(TOKEN_LEASE_KEY, owner, 90_000))) {
        if (Date.now() >= deadline) throw new HanoiCheckApiError('HanoiCheck đang làm mới mã truy cập. Vui lòng thử lại sau.', 503);
        await pause(200);
      }
      leaseOwner = owner;
      try { await work(); }
      finally { leaseOwner = undefined; await releaseIntegrationLease(TOKEN_LEASE_KEY, owner); }
    },
  };
}

const client = createHanoiCheckClient(databaseTokenStore());
export const ensureAccessToken = client.ensureAccessToken;
export const hcSignedRequest = client.hcSignedRequest;
