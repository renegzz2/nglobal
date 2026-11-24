export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function matchesSecret(received: string | null, configured: string | undefined) {
  if (!received || !configured || received.length > 512) return false;
  const [actual, expected] = await Promise.all([sha256(received), sha256(configured)]);
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}

export async function verifyTiveSignature(header: string | null, body: string, secret: string | undefined, now = Date.now()) {
  if (!header || !secret) return false;
  const match = /^t=(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z),v1=([A-Za-z0-9+/]{43}=)$/.exec(header);
  if (!match) return false;
  const [, timestamp, signature] = match;
  const receivedAt = Date.parse(timestamp.replace(' ', 'T'));
  if (!Number.isFinite(receivedAt) || Math.abs(now - receivedAt) > 5 * 60_000) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(signature), char => char.charCodeAt(0)),
    encoder.encode(timestamp + '.' + body));
}

export async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  const stream = request.body?.getReader();
  if (!stream) return '';
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const { value, done } = await stream.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) {
        await stream.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    stream.releaseLock();
  }
}

export function inRecipientSchedule(
  weekdays: string | null,
  start: string | null,
  end: string | null,
  day: number,
  minute: number,
) {
  const days = weekdays ? weekdays.split(',').map(value => Number(value.trim())) : [0, 1, 2, 3, 4, 5, 6];
  const parse = (value: string) => {
    if (!/^(?:[01]?\d|2[0-4]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value)) return NaN;
    const [hours, minutes] = value.split(':').map(Number);
    return hours === 24 && minutes !== 0 ? NaN : hours * 60 + minutes;
  };
  if (!start || !end) return days.includes(day);
  const from = parse(start);
  const to = parse(end);
  if (Number.isNaN(from) || Number.isNaN(to) || from === to) return false;
  if (from < to) return days.includes(day) && minute >= from && minute < to;
  return (days.includes(day) && minute >= from) ||
    (days.includes((day + 6) % 7) && minute < to);
}

export function mexicoCityScheduleTime(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(now);
  const read = (name: string) => parts.find(part => part.type === name)?.value;
  return {
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(read('weekday') ?? ''),
    minute: Number(read('hour')) * 60 + Number(read('minute')),
  };
}

export function isTrustedPushEndpoint(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return false;
    const providers = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
    return providers.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}
