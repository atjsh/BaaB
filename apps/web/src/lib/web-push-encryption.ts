import { buildPushPayload } from './webcrypto-web-push';
import { fromBase64Url, toBase64Url } from 'web-push-browser';

export interface EncryptWebPushOptions {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  vapidKeyPair: {
    publicKey: string;
    privateKey: string;
  };
  payload: string;
  contact: string;
  ttl?: number;
  urgency?: 'low' | 'normal' | 'high';
}

export async function encryptWebPush(options: EncryptWebPushOptions): Promise<{
  endpoint: string;
  body: Uint8Array;
  headers: Record<string, string>;
}> {
  const { subscription, vapidKeyPair, payload } = options;
  const normalizedPrivateKey = await normalizeVapidPrivateKey(vapidKeyPair.privateKey);
  const result = await buildPushPayload(
    {
      data: payload,
      options: {
        ttl: options.ttl || 86400,
        urgency: options.urgency,
      },
    },
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      expirationTime: null,
    },
    {
      privateKey: normalizedPrivateKey,
      publicKey: vapidKeyPair.publicKey,
      subject: options.contact,
    },
  );
  return {
    endpoint: subscription.endpoint,
    body: result.body,
    headers: result.headers,
  };
}

export type EncryptWebPushResult = Awaited<ReturnType<typeof encryptWebPush>>;

export function arrayBufferToBase64Url(buffer: Uint8Array): string {
  return toBase64Url(buffer);
}

async function normalizeVapidPrivateKey(privateKey: string): Promise<string> {
  const decoded = fromBase64Url(privateKey);

  if (decoded.byteLength === 32) {
    return privateKey;
  }

  // Mark extractable so we can export the JWK for the raw `d` value.
  const key = await crypto.subtle.importKey('pkcs8', decoded, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', key);

  if (!jwk.d) {
    throw new Error('Invalid VAPID private key: missing "d"');
  }

  return jwk.d;
}
