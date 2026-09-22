const baseUrl = (process.env.SMOKE_BASE_URL || 'http://localhost:3010').replace(/\/$/, '');
const codes = Array.from({ length: 23 }, (_, index) => `NCC-${String(index + 1).padStart(2, '0')}`);
const failures = [];

async function expectResponse(path, expectedStatus = 200) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    if (response.status !== expectedStatus) failures.push(`${path}: HTTP ${response.status}, cần ${expectedStatus}`);
    return response;
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const health = await expectResponse('/api/health');
if (health?.ok) {
  const body = await health.json();
  if (body.checks?.requiredSupplierCodes !== 23 || body.checks?.suppliers < 23 || body.checks?.missingCodes?.length) failures.push('/api/health: bộ mã NCC-01 đến NCC-23 chưa đầy đủ');
}

await expectResponse('/');
await expectResponse('/admin/login');
const admin = await expectResponse('/admin', 307);
if (admin && !admin.headers.get('location')?.includes('/admin/login')) failures.push('/admin: không chuyển hướng tới trang đăng nhập');

await Promise.all(codes.flatMap(code => [
  expectResponse(`/qr/${code}`),
  (async () => {
    const response = await expectResponse(`/api/suppliers/${code}`);
    if (!response?.ok) return;
    const supplier = await response.json();
    if (supplier.code !== code) failures.push(`/api/suppliers/${code}: trả về sai mã NCC`);
  })()
]));

for (const format of ['png', 'svg']) {
  const response = await expectResponse(`/api/qr/NCC-01?format=${format}`);
  if (!response?.ok) continue;
  const expectedType = format === 'png' ? 'image/png' : 'image/svg+xml';
  if (!response.headers.get('content-type')?.includes(expectedType)) failures.push(`QR ${format}: sai Content-Type`);
  if (response.headers.get('x-qr-target') !== `${baseUrl}/qr/NCC-01`) failures.push(`QR ${format}: sai URL đích`);
}

if (failures.length) {
  console.error(`Smoke test thất bại (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Smoke test đạt: trang chủ, đăng nhập, health check, ${codes.length} trang QR, ${codes.length} API NCC và QR PNG/SVG.`);
