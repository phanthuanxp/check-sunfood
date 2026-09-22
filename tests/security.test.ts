import assert from 'node:assert/strict';
import test from 'node:test';
import { rejectUntrustedMutation } from '../lib/security';

test('accepts public HTTPS origin when reverse proxy forwards to internal HTTP', () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://check.sunfoodtaydo.com';
  try {
    const request = new Request('http://127.0.0.1:3012/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://check.sunfoodtaydo.com', 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(rejectUntrustedMutation(request), null);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test('rejects a different origin even when forwarded to the same internal listener', async () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://check.sunfoodtaydo.com';
  try {
    const request = new Request('http://127.0.0.1:3012/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://another.example', 'sec-fetch-site': 'same-origin' },
    });
    const rejection = rejectUntrustedMutation(request);
    assert.equal(rejection?.status, 403);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});
