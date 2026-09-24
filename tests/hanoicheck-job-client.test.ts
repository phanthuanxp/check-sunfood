import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForHanoiCheckJob } from '../lib/hanoicheck-job-client';

test('normalizes an immediate legacy sync result', async () => {
  const result = await waitForHanoiCheckJob(new Response(JSON.stringify({ processed: 1, created: 1, updated: 0, skipped: [] })));
  assert.deepEqual(result, { processed: 1, created: 1, updated: 0, pending: 0, unchanged: 0, skipped: [] });
});

test('polls a durable job through queued, running and successful states', async t => {
  const originalFetch = globalThis.fetch;
  const states = [
    { status: 'QUEUED' },
    { status: 'RUNNING' },
    { status: 'SUCCEEDED', result: { processed: 2, created: 1, updated: 0, pending: 1, unchanged: 0, skipped: [] } },
  ];
  globalThis.fetch = (async () => new Response(JSON.stringify(states.shift()), { status: 200 })) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const observed: string[] = [];
  const result = await waitForHanoiCheckJob(
    new Response(JSON.stringify({ id: 'job_123', status: 'QUEUED' }), { status: 202 }),
    status => observed.push(status),
    { sleep: async () => undefined, maxAttempts: 3 },
  );
  assert.deepEqual(observed, ['QUEUED', 'RUNNING', 'SUCCEEDED']);
  assert.equal(result.pending, 1);
});

test('surfaces the worker failure without exposing an invalid result', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: 'FAILED', error: 'Nguồn không hợp lệ.' }), { status: 200 })) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(
    waitForHanoiCheckJob(new Response(JSON.stringify({ id: 'job_456' }), { status: 202 }), undefined, { sleep: async () => undefined, maxAttempts: 1 }),
    /Nguồn không hợp lệ/,
  );
});
