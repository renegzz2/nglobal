import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { inRecipientSchedule, isTrustedPushEndpoint, mexicoCityScheduleTime, readBody, verifyTiveSignature } from '../supabase/functions/_shared/webhook.ts';

test('recipient hours include minutes and follow the start day of overnight shifts', () => {
    assert.equal(inRecipientSchedule('1', '22:30', '06:45', 1, 22 * 60 + 29), false);
    assert.equal(inRecipientSchedule('1', '22:30', '06:45', 1, 22 * 60 + 30), true);
    assert.equal(inRecipientSchedule('1', '22:30', '06:45', 2, 6 * 60 + 44), true);
    assert.equal(inRecipientSchedule('1', '22:30', '06:45', 2, 6 * 60 + 45), false);
    assert.equal(inRecipientSchedule('1', '22:30', '06:45', 3, 5 * 60), false);
    assert.equal(inRecipientSchedule('1', '08:15', '24:00', 1, 500), true);
    assert.deepEqual(mexicoCityScheduleTime(new Date('2026-11-24T04:32:00Z')), { day: 1, minute: 22 * 60 + 32 });
});

test('Tive signature binds the timestamp to the original body and rejects stale requests', async () => {
    const body = '{"temperature":0}';
    const secret = 'unit-test-webhook-key';
    const timestamp = '2026-11-24 04:32:00Z';
    const time = Date.parse('2026-11-24T04:32:00Z');
    const hash = createHmac('sha256', secret).update(timestamp + '.' + body).digest('base64');
    const header = 't=' + timestamp + ',v1=' + hash;
    assert.equal(await verifyTiveSignature(header, body, secret, time), true);
    assert.equal(await verifyTiveSignature(header, body + ' ', secret, time), false);
    assert.equal(await verifyTiveSignature(header, body, secret, time + 301_000), false);
    assert.equal(await verifyTiveSignature(header, body, undefined, time), false);
});

test('request body limit counts UTF-8 bytes', async () => {
    const url = 'https://app.example';
    assert.equal(await readBody(new Request(url, { method: 'POST', body: 'acción' }), 7), 'acción');
    assert.equal(await readBody(new Request(url, { method: 'POST', body: 'acción' }), 6), null);
});

test('push requests only use HTTPS endpoints from trusted browser providers', () => {
    assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true);
    assert.equal(isTrustedPushEndpoint('https://web.push.apple.com/example'), true);
    assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com.example.invalid/example'), false);
    assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com@localhost/example'), false);
    assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com:8443/example'), false);
    assert.equal(isTrustedPushEndpoint('http://fcm.googleapis.com/example'), false);
});
