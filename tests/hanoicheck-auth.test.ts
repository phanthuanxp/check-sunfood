import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { buildCanonicalString, signHanoiCheckRequest } from '../lib/hanoicheck-auth';

test('canonical string joins METHOD/PATH/timestamp/nonce/body-hash with newlines, in order', () => {
  const canonical = buildCanonicalString('get', '/api/supplier/orders', 1758000000, 'nonce-abc', '');
  const emptyBodyHash = createHash('sha256').update('', 'utf8').digest('hex');
  assert.equal(canonical, `GET\n/api/supplier/orders\n1758000000\nnonce-abc\n${emptyBodyHash}`);
});

test('method is always uppercased in the canonical string', () => {
  const canonical = buildCanonicalString('post', '/api/supplier/orders', 1, 'n', '');
  assert.match(canonical, /^POST\n/);
});

test('a non-empty body is hashed, not embedded verbatim', () => {
  const body = JSON.stringify({ a: 1 });
  const canonical = buildCanonicalString('POST', '/api/supplier/warehouses/merge', 1758000000, 'nonce-xyz', body);
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  assert.equal(canonical, `POST\n/api/supplier/warehouses/merge\n1758000000\nnonce-xyz\n${bodyHash}`);
  assert.doesNotMatch(canonical, /\{"a":1\}/);
});

test('signature is Base64(HMAC-SHA256(canonical string, hmac secret)), verifiable independently', () => {
  const method = 'GET';
  const pathname = '/api/supplier/orders';
  const timestamp = 1758000000;
  const nonce = 'nonce-abc';
  const body = '';
  const secret = 'test-hmac-secret';
  const signature = signHanoiCheckRequest(method, pathname, timestamp, nonce, body, secret);
  const expectedCanonical = buildCanonicalString(method, pathname, timestamp, nonce, body);
  const expectedSignature = createHmac('sha256', secret).update(expectedCanonical, 'utf8').digest('base64');
  assert.equal(signature, expectedSignature);
});

test('changing any single component changes the signature', () => {
  const base = signHanoiCheckRequest('GET', '/api/supplier/orders', 1758000000, 'nonce-abc', '', 'secret');
  assert.notEqual(base, signHanoiCheckRequest('POST', '/api/supplier/orders', 1758000000, 'nonce-abc', '', 'secret'));
  assert.notEqual(base, signHanoiCheckRequest('GET', '/api/supplier/orders/1', 1758000000, 'nonce-abc', '', 'secret'));
  assert.notEqual(base, signHanoiCheckRequest('GET', '/api/supplier/orders', 1758000001, 'nonce-abc', '', 'secret'));
  assert.notEqual(base, signHanoiCheckRequest('GET', '/api/supplier/orders', 1758000000, 'nonce-def', '', 'secret'));
  assert.notEqual(base, signHanoiCheckRequest('GET', '/api/supplier/orders', 1758000000, 'nonce-abc', '', 'other-secret'));
});
