import assert from 'node:assert/strict';
import test from 'node:test';
import { validateExtraction } from '../lib/ai-extraction';

test('keeps unknown legal fields empty rather than inventing values', () => {
  const result = validateExtraction({ title: 'Giấy chứng nhận', category: 'FOOD_SAFETY', supplierName: null, taxCode: '', documentNumber: null, issuedAt: '2026-02-31', expiresAt: null, evidence: null, warnings: [] });
  assert.equal(result.supplierName, null);
  assert.equal(result.taxCode, null);
  assert.equal(result.issuedAt, null);
});

test('rejects unsupported categories and warns when expiry precedes issuance', () => {
  const result = validateExtraction({ title: 'Phiếu kiểm nghiệm', category: 'FAKE_CERT', supplierName: 'NCC', taxCode: null, documentNumber: null, issuedAt: '2026-09-20', expiresAt: '2026-01-01', evidence: '2026', warnings: [] });
  assert.equal(result.category, null);
  assert.match(result.warnings.join(' '), /trước ngày cấp/);
});

test('keeps only known confidence levels and defaults missing confidence to null', () => {
  const result = validateExtraction({ title: 'Giấy chứng nhận', category: 'FOOD_SAFETY', supplierName: null, taxCode: null, documentNumber: null, issuedAt: null, expiresAt: null, evidence: null, warnings: [], confidence: { title: 'HIGH', category: 'GUESS', issuedAt: null } });
  assert.equal(result.confidence.title, 'HIGH');
  assert.equal(result.confidence.category, null);
  assert.equal(result.confidence.issuedAt, null);
  assert.equal(result.confidence.expiresAt, null);
});
