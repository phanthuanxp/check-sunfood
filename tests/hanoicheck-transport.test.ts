import assert from 'node:assert/strict';
import test from 'node:test';
import { createHanoiCheckClient, signHanoiCheckRequest, type HanoiCheckTokenSnapshot, type HanoiCheckTokenStore } from '../lib/hanoicheck-auth';
import { normalizeHanoiCheckEndpoint, hanoiCheckBusinessUrl } from '../lib/hanoicheck-endpoint';
import { shouldInvalidateHanoiCheckTokens } from '../lib/hanoicheck-settings';
import { HanoiCheckApiError } from '../lib/hanoicheck-errors';

const NOW = 1_800_000_000_000;
function makeStore(expired = false) {
  let state: HanoiCheckTokenSnapshot = {
    configurationId: 'config-1', credentials: { baseUrl: 'https://ncc-api.hanoicheck.com.vn', traceConnectionCode: 'NCC-TEST', clientId: 'dummy-client', clientSecret: 'dummy-client-secret', hmacSecret: 'dummy-hmac-secret' },
    accessToken: expired ? null : 'dummy-access', refreshToken: 'dummy-refresh', expiresAt: expired ? NOW - 1 : NOW + 3_600_000,
  };
  let saves = 0;
  const store: HanoiCheckTokenStore = {
    async read() { return structuredClone(state); },
    async save(snapshot, tokens) {
      if (snapshot.configurationId !== state.configurationId) return false;
      saves++;
      state = { ...state, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: NOW + tokens.expires_in * 1000 };
      return true;
    },
    async invalidate(snapshot) { if (snapshot.configurationId === state.configurationId && snapshot.accessToken === state.accessToken) state = { ...state, accessToken: null, expiresAt: null }; },
    async exclusive(work) { await work(); },
  };
  return { store, read: () => state, saves: () => saves, replace: (value: HanoiCheckTokenSnapshot) => { state = value; } };
}
const tokenResponse = (access = 'renewed-access') => Response.json({ access_token: access, refresh_token: 'rotated-refresh', expires_in: 3600 });

test('API endpoint accepts only exact approved public HTTPS host origins', () => {
  assert.equal(normalizeHanoiCheckEndpoint('https://NCC-API.HANOICHECK.COM.VN/'), 'https://ncc-api.hanoicheck.com.vn');
  assert.equal(normalizeHanoiCheckEndpoint('https://sandbox.hanoicheck.com.vn', 'sandbox.hanoicheck.com.vn'), 'https://sandbox.hanoicheck.com.vn');
  for (const endpoint of [
    'http://ncc-api.hanoicheck.com.vn', 'https://ncc-api.hanoicheck.com.vn.evil.com',
    'https://ncc-api.hanoicheck.com.vn:443', 'https://ncc-api.hanoicheck.com.vn:8443',
    'https://user:pass@ncc-api.hanoicheck.com.vn', 'https://ncc-api.hanoicheck.com.vn/api',
    'https://ncc-api.hanoicheck.com.vn/../', 'https://ncc-api.hanoicheck.com.vn/?x=1',
    'https://ncc-api.hanoicheck.com.vn/#x', 'https://ncc-api.hanoicheck.com.vn\\@evil.com',
    'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://api.internal',
    'https://ncc-api.hanoicheck.com.vn.', 'https://unknown.hanoicheck.com.vn',
  ]) assert.throws(() => normalizeHanoiCheckEndpoint(endpoint, '127.0.0.1,localhost,api.internal,*'), HanoiCheckApiError, endpoint);
});

test('business paths cannot escape API prefix, target auth or merge, or inject query/fragment', () => {
  for (const path of ['/../token', '//evil.com', '/orders?x=1', '/orders#x', '/orders/%2e%2e/token', '/orders/merge', '/token', '/refresh_token']) {
    assert.throws(() => hanoiCheckBusinessUrl('https://ncc-api.hanoicheck.com.vn', path, {}), HanoiCheckApiError);
  }
  assert.equal(hanoiCheckBusinessUrl('https://ncc-api.hanoicheck.com.vn', '/orders/order_1', { page: 2 }).href, 'https://ncc-api.hanoicheck.com.vn/api/supplier/orders/order_1?page=2');
});

test('every authentication-affecting settings update invalidates saved tokens', () => {
  const current = { baseUrl: 'https://ncc-api.hanoicheck.com.vn', traceConnectionCode: 'NCC-TEST' };
  assert.equal(shouldInvalidateHanoiCheckTokens(current, current), false);
  for (const next of [{ baseUrl: 'https://sandbox.hanoicheck.com.vn' }, { clientId: 'new' }, { clientSecret: 'new' }, { hmacSecret: 'new' }, { traceConnectionCode: 'new' }]) {
    assert.equal(shouldInvalidateHanoiCheckTokens(current, next), true);
  }
});

test('business POST is rejected before credentials or network access', async () => {
  const { store } = makeStore();
  let calls = 0;
  const client = createHanoiCheckClient(store, { fetch: async () => { calls++; throw new Error('must not fetch'); } });
  // Runtime validation is required in addition to TypeScript's read-only signature.
  await assert.rejects(client.hcSignedRequest('POST' as 'GET', '/orders'), (error: unknown) => error instanceof HanoiCheckApiError && error.status === 405);
  assert.equal(calls, 0);
});

test('transient GET retries are bounded and sign each attempt with a fresh nonce', async () => {
  const { store } = makeStore();
  const calls: { url: string; init?: RequestInit }[] = [];
  const sleeps: number[] = [];
  let nonce = 0;
  const client = createHanoiCheckClient(store, {
    now: () => NOW, nonce: () => `nonce-${++nonce}`, sleep: async ms => { sleeps.push(ms); },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return calls.length < 3 ? Response.json({ message: 'upstream secret must not be shown' }, { status: 503, headers: { 'Retry-After': '999999' } }) : Response.json({ data: ['ok'] });
    },
  });
  assert.deepEqual(await client.hcSignedRequest('GET', '/orders', { page: 1 }), { data: ['ok'] });
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [2000, 2000]);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.init?.redirect, 'manual');
    const headers = new Headers(call.init?.headers);
    assert.equal(headers.get('X-Nonce'), `nonce-${index + 1}`);
    assert.equal(headers.get('X-Signature'), signHanoiCheckRequest('GET', '/api/supplier/orders', NOW / 1000, `nonce-${index + 1}`, '', 'dummy-hmac-secret'));
  }
});

test('upstream failures never return vendor bodies or credential values and stop at three attempts', async () => {
  const { store } = makeStore();
  let calls = 0;
  const client = createHanoiCheckClient(store, { now: () => NOW, sleep: async () => {}, fetch: async () => {
    calls++; return Response.json({ message: 'dummy-client-secret <html>traceback</html>' }, { status: 500 });
  } });
  await assert.rejects(client.hcSignedRequest('GET', '/orders'), (error: unknown) => {
    assert.ok(error instanceof HanoiCheckApiError);
    assert.doesNotMatch(error.message, /dummy|traceback|html/);
    return true;
  });
  assert.equal(calls, 3);
});

test('redirect responses are rejected without following them or retrying', async () => {
  const { store } = makeStore();
  let calls = 0;
  const client = createHanoiCheckClient(store, { now: () => NOW, fetch: async (_url, init) => {
    calls++; assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://example.com/collect' } });
  } });
  await assert.rejects(client.hcSignedRequest('GET', '/orders'), HanoiCheckApiError);
  assert.equal(calls, 1);
});

test('concurrent callers share exactly one rotating refresh grant and reload persisted tokens', async () => {
  const fixture = makeStore(true);
  let calls = 0;
  const client = createHanoiCheckClient(fixture.store, { now: () => NOW, fetch: async (url, init) => {
    calls++;
    assert.match(String(url), /\/refresh_token$/);
    assert.equal(init?.redirect, 'manual');
    await new Promise(resolve => setTimeout(resolve, 5));
    return tokenResponse();
  } });
  const results = await Promise.all(Array.from({ length: 12 }, () => client.ensureAccessToken()));
  assert.equal(calls, 1);
  assert.equal(fixture.saves(), 1);
  assert.ok(results.every(result => result.accessToken === 'renewed-access'));
});

test('ambiguous refresh failure is not replayed; one fresh client grant recovers', async () => {
  const fixture = makeStore(true);
  const paths: string[] = [];
  const client = createHanoiCheckClient(fixture.store, { now: () => NOW, fetch: async url => {
    paths.push(String(url));
    if (paths.length === 1) throw new Error('network reset after token rotation');
    return tokenResponse();
  } });
  assert.equal((await client.ensureAccessToken()).accessToken, 'renewed-access');
  assert.deepEqual(paths.map(url => new URL(url).pathname), ['/api/supplier/refresh_token', '/api/supplier/token']);
});

test('settings changed during refresh cannot persist or return credentials/tokens from old configuration', async () => {
  const fixture = makeStore(true);
  let calls = 0;
  const client = createHanoiCheckClient(fixture.store, { now: () => NOW, fetch: async (_url, init) => {
    calls++;
    if (calls === 1) {
      fixture.replace({ ...fixture.read(), configurationId: 'config-2', credentials: { ...fixture.read().credentials, clientId: 'new-client' }, refreshToken: null });
      return tokenResponse('obsolete-access');
    }
    assert.match(String(init?.body), /new-client/);
    return tokenResponse('current-access');
  } });
  const result = await client.ensureAccessToken();
  assert.equal(result.accessToken, 'current-access');
  assert.equal(result.credentials.clientId, 'new-client');
  assert.equal(fixture.saves(), 1);
});

test('401 refreshes access token only once and retries GET with the new token', async () => {
  const fixture = makeStore();
  let businessCalls = 0;
  let grants = 0;
  const client = createHanoiCheckClient(fixture.store, { now: () => NOW, fetch: async (url, init) => {
    if (String(url).endsWith('/refresh_token')) { grants++; return tokenResponse(); }
    businessCalls++;
    if (businessCalls === 1) return new Response(null, { status: 401 });
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer renewed-access');
    return new Response(null, { status: 401 });
  } });
  await assert.rejects(client.hcSignedRequest('GET', '/orders'), HanoiCheckApiError);
  assert.equal(businessCalls, 2);
  assert.equal(grants, 1);
});

test('token payload validation rejects non-expiring or malformed responses', async () => {
  const fixture = makeStore(true);
  fixture.replace({ ...fixture.read(), refreshToken: null });
  const client = createHanoiCheckClient(fixture.store, { now: () => NOW, fetch: async () => Response.json({ access_token: 'a', refresh_token: 'b', expires_in: -1 }) });
  await assert.rejects(client.ensureAccessToken(), HanoiCheckApiError);
  assert.equal(fixture.saves(), 0);
});
