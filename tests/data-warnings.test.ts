import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDataWarnings, type WarningSupplier } from '../lib/data-warnings';

const now = new Date('2026-09-22T00:00:00Z');

function supplier(overrides: Partial<WarningSupplier> = {}): WarningSupplier {
  return {
    code: 'NCC-01',
    name: 'Công ty mẫu',
    productName: 'Sản phẩm mẫu',
    address: 'Địa chỉ mẫu',
    taxCode: null,
    verificationStatus: 'VERIFIED',
    documents: [{ title: 'Giấy phép', expiresAt: null }],
    ...overrides,
  };
}

test('flags suppliers with zero documents as critical and stops there', () => {
  const warnings = computeDataWarnings([supplier({ documents: [] })], now);
  const own = warnings.filter((w) => w.code === 'NCC-01' && w.rule !== 'NOT_VERIFIED');
  assert.equal(own.length, 1);
  assert.equal(own[0].rule, 'MISSING_DOCUMENTS');
  assert.equal(own[0].severity, 'critical');
});

test('buckets document expiry into the right severity by days remaining', () => {
  const cases: [string, number, string][] = [
    ['2026-09-10T00:00:00Z', -1, 'DOCUMENT_EXPIRED'],
    ['2026-09-25T00:00:00Z', -1, 'DOCUMENT_DUE_30'],
    ['2026-11-15T00:00:00Z', -1, 'DOCUMENT_DUE_60'],
    ['2026-12-10T00:00:00Z', -1, 'DOCUMENT_DUE_90'],
    ['2027-06-01T00:00:00Z', -1, ''],
  ];
  for (const [expiresAt, , expectedRule] of cases) {
    const warnings = computeDataWarnings([supplier({ documents: [{ title: 'Giấy phép', expiresAt }] })], now);
    const expiryWarning = warnings.find((w) => w.rule.startsWith('DOCUMENT_'));
    if (expectedRule) assert.equal(expiryWarning?.rule, expectedRule, `expected ${expectedRule} for ${expiresAt}`);
    else assert.equal(expiryWarning, undefined, `expected no expiry warning for ${expiresAt}`);
  }
});

test('flags missing product and address separately', () => {
  const warnings = computeDataWarnings([supplier({ productName: null, address: null })], now);
  assert.ok(warnings.some((w) => w.rule === 'MISSING_PRODUCT'));
  assert.ok(warnings.some((w) => w.rule === 'MISSING_ADDRESS'));
});

test('flags suppliers sharing a non-empty tax code as a critical conflict on both sides', () => {
  const warnings = computeDataWarnings([
    supplier({ code: 'NCC-08', taxCode: '0100112233' }),
    supplier({ code: 'NCC-17', taxCode: '0100112233' }),
  ], now);
  const dup = warnings.filter((w) => w.rule === 'DUPLICATE_TAX_CODE');
  assert.equal(dup.length, 2);
  assert.deepEqual(dup.find((w) => w.code === 'NCC-08')?.relatedCodes, ['NCC-17']);
});

test('does not flag suppliers with different or missing tax codes', () => {
  const warnings = computeDataWarnings([
    supplier({ code: 'NCC-01', taxCode: null }),
    supplier({ code: 'NCC-02', taxCode: null }),
  ], now);
  assert.ok(!warnings.some((w) => w.rule === 'DUPLICATE_TAX_CODE'));
});

test('flags suppliers sharing a name after trimming/case, matching the NCC-19/NCC-20 case', () => {
  const warnings = computeDataWarnings([
    supplier({ code: 'NCC-19', name: 'Công ty TNHH Hải Hà - Kotobuki' }),
    supplier({ code: 'NCC-20', name: '  công ty tnhh hải hà - kotobuki  ' }),
  ], now);
  const dup = warnings.filter((w) => w.rule === 'DUPLICATE_NAME');
  assert.equal(dup.length, 2);
  assert.deepEqual(dup.find((w) => w.code === 'NCC-19')?.relatedCodes, ['NCC-20']);
});

test('sorts critical findings before warning and info findings', () => {
  const warnings = computeDataWarnings([
    supplier({ code: 'NCC-02', productName: null, verificationStatus: 'PENDING' }),
    supplier({ code: 'NCC-01', documents: [] }),
  ], now);
  assert.equal(warnings[0].severity, 'critical');
  assert.equal(warnings[warnings.length - 1].severity, 'info');
});
