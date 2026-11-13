import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Événements des webhooks d'entreprise ou de revendeur (call.completed, sms.status) : en-têtes
 * `X-VoxNova-Event` et `X-VoxNova-Signature: sha256=<HMAC-SHA256 du corps brut avec le secret du webhook>`.
 * (Les rappels des applications vocales utilisent `verifySignature`, au format `t=…,v1=…`.)
 */
export interface SmsStatusEvent {
  event: 'sms.status';
  createdAt: string;
  data: { id: string; orgId: string; to: string; status: string; messageId: string | null; tag: string | null; type: string | null; segments: number; sender: string | null; error: string | null; at: string };
}
export function verifyWebhook(secret: string, rawBody: string | Buffer, header: string | undefined | null): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const got = Buffer.from(header.slice(7), 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}
