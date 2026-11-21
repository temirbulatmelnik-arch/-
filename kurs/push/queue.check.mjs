import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openQueue, scheduleBody } from './queue.mjs';

const subscription = { endpoint: 'https://web.push.apple.com/demo', keys: { auth: 'A'.repeat(22), p256dh: 'B'.repeat(87) } };
const now = Date.parse('2026-11-22T17:00:00Z');

test('accepts only push providers and bounded opaque schedule payloads', () => {
  const id = randomUUID(), at = new Date(now + 60_000).toISOString();
  assert.ok(scheduleBody({ subscription, scheduled: [{ id, at }] }, now));
  assert.equal(scheduleBody({ subscription, scheduled: [{ id, at }, { id, at }] }, now), null);
  assert.equal(scheduleBody({ subscription: { ...subscription, endpoint: 'https://example.test/other' }, scheduled: [] }, now), null);
});

test('replaces, cancels, deduplicates and retires invalid subscriptions', () => {
  const queue = openQueue(':memory:');
  const sid = randomUUID(), id = randomUUID(), next = randomUUID(), token = randomUUID() + randomUUID();
  const set = (ids) => queue.replace(sid, token, { subscription: JSON.stringify(subscription), schedule: new Map(ids) }, now);
  assert.ok(set([[id, now + 30_000]]));
  assert.equal(queue.authorize(sid, token), true);
  assert.equal(queue.authorize(sid, randomUUID()), false);
  assert.ok(set([[next, now + 40_000]]));
  assert.deepEqual(queue.ready(now + 35_000), []);
  const [job] = queue.ready(now + 40_000);
  assert.equal(job.id, next);
  queue.delivered(job);
  assert.ok(set([[next, now + 40_000]]));
  assert.deepEqual(queue.ready(now + 40_000), []);
  assert.ok(set([[next, now + 45_000]]));
  queue.failed(queue.ready(now + 45_000)[0], 410, now + 45_000);
  assert.equal(queue.status(sid), null);
  queue.close();
});
