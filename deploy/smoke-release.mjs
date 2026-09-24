const base = new URL(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3010');
const publicSite = new URL(process.env.SMOKE_PUBLIC_SITE_URL || base.origin);
const lotId = process.env.SMOKE_LOT_PUBLIC_ID;
const failures = [];
const warnings = [];
if (!['http:', 'https:'].includes(base.protocol) || !['http:', 'https:'].includes(publicSite.protocol)) throw new Error('Smoke URLs must use HTTP(S).');
if (base.username || base.password || publicSite.username || publicSite.password) throw new Error('Smoke URLs must not contain credentials.');
if (!lotId || !/^[a-zA-Z0-9_-]+$/.test(lotId)) throw new Error('Set SMOKE_LOT_PUBLIC_ID to a known published lot publicId.');

async function request(route, statuses = [200]) {
  try {
    const response = await fetch(new URL(route, base), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (!statuses.includes(response.status)) failures.push(`${route}: HTTP ${response.status}`);
    return response;
  } catch { failures.push(`${route}: request failed or timed out`); return null; }
}
async function check(route, statuses = [200]) {
  const response = await request(route, statuses);
  if (response) await response.arrayBuffer();
  return response;
}
async function qr(route, target) {
  for (const format of ['png', 'svg']) {
    const response = await request(`${route}?format=${format}`);
    if (!response) continue;
    const type = format === 'png' ? 'image/png' : 'image/svg+xml';
    if (!response.headers.get('content-type')?.includes(type)) failures.push(`${route}: wrong ${format} content type`);
    if (response.headers.get('x-qr-target') !== `${publicSite.origin}${target}`) failures.push(`${route}: wrong public QR target`);
    if ((await response.arrayBuffer()).byteLength < 50) failures.push(`${route}: empty QR payload`);
  }
}

const health = await request('/api/health', [200, 503]);
if (health) {
  try {
    const body = await health.json();
    const issues = body.checks?.configurationIssues;
    const knownSQLiteDegraded = health.status === 503 && process.env.ALLOW_SQLITE_DEGRADED === 'true' &&
      body.status === 'degraded' && Array.isArray(issues) && issues.length === 1 && issues[0] === 'DATABASE_NOT_POSTGRESQL';
    if (health.status !== 200 && !knownSQLiteDegraded) failures.push('/api/health: unexpected degraded/down state');
    if (knownSQLiteDegraded) warnings.push('Production remains degraded because it uses SQLite; this is an explicit temporary exception, not a health fix.');
    if (body.database !== 'connected' || body.checks?.requiredSupplierCodes !== 23 || !Array.isArray(body.checks?.missingCodes) || body.checks.missingCodes.length) failures.push('/api/health: database or fixed supplier-code invariant failed');
  } catch { failures.push('/api/health: invalid JSON'); }
}
const homepage = await request('/');
if (homepage) {
  const html = await homepage.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"\s]+)"/g)]
    .map(match => match[1].replaceAll('&amp;', '&')).filter(url => url.startsWith('/_next/static/'));
  for (const extension of ['.js', '.css']) {
    const asset = assets.find(url => url.split('?')[0].endsWith(extension));
    if (!asset) failures.push(`Homepage has no ${extension} static asset`);
    else await request(asset);
  }
}
await check('/admin/login');
const admin = await request('/admin', [307]);
if (admin) {
  if (!admin.headers.get('location')?.includes('/admin/login')) failures.push('/admin: missing login redirect');
  await admin.arrayBuffer();
}
for (const route of ['/api/admin/ai-settings', '/api/admin/hanoicheck-settings', '/api/admin/hanoicheck/jobs', '/api/admin/hanoicheck/mappings', '/api/admin/hanoicheck/snapshots']) {
  await check(route, [401]);
}
for (let index = 1; index <= 23; index++) await check(`/qr/NCC-${String(index).padStart(2, '0')}`);
for (const code of ['NCC-01', 'NCC-23']) {
  const response = await request(`/api/suppliers/${code}`);
  if (response) {
    try { if ((await response.json()).code !== code) failures.push(`${code}: supplier API code mismatch`); }
    catch { failures.push(`${code}: invalid supplier JSON`); }
  }
}
await check(`/lot/${lotId}`);
await qr('/api/qr/NCC-01', '/qr/NCC-01');
await qr(`/api/qr/lot/${lotId}`, `/lot/${lotId}`);
for (const warning of warnings) console.warn(warning);
if (failures.length) {
  console.error(`Release smoke failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else console.log('Read-only release smoke passed: public assets, fixed supplier QR pages, API, admin access guard, published lot, PNG/SVG target URLs.');
