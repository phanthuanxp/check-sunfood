import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptAiKey, encryptAiKey } from '../lib/ai-settings';

test('AI key is encrypted with authenticated encryption and can be recovered', () => {
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = 'unit-test-secret-with-at-least-32-characters';
  try {
    const secret = 'sk-test-secret-value-not-for-production';
    const encrypted = encryptAiKey(secret);
    assert.ok(encrypted.startsWith('v1:'));
    assert.ok(!encrypted.includes(secret));
    assert.equal(decryptAiKey(encrypted), secret);
    const parts = encrypted.split(':');
    parts[3] = parts[3].slice(0, -1) + (parts[3].endsWith('A') ? 'B' : 'A');
    assert.throws(() => decryptAiKey(parts.join(':')));
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = previous;
  }
});
