/**
 * Build push payload with encryption and VAPID headers
 * Main entry point for Web Push encryption
 */

import { encodeBase64Url } from './base64';
import { encryptNotification } from './encrypt';
import type { PushMessage, PushSubscription, VapidKeys } from './types';
import { vapidHeaders } from './vapid';

export async function buildPushPayload(
  message: PushMessage,
  subscription: PushSubscription,
  vapid: VapidKeys,
) {
  const { headers } = await vapidHeaders(subscription, vapid);

  const encrypted = await encryptNotification(
    subscription,
    new TextEncoder().encode(
      // if its a primitive, convert to string, otherwise stringify
      typeof message.data === 'string' || typeof message.data === 'number'
        ? message.data.toString()
        : JSON.stringify(message.data),
    ),
  );

  return {
    headers: {
      ...headers,
      'crypto-key': `dh=${encodeBase64Url(encrypted.localPublicKeyBytes)};${headers['crypto-key']}`,
      encryption: `salt=${encodeBase64Url(encrypted.salt)}`,
      ttl: (message.options?.ttl || 60).toString(),
      ...(message.options?.urgency && {
        urgency: message.options.urgency,
      }),
      ...(message.options?.topic && {
        topic: message.options.topic,
      }),
      'content-encoding': 'aesgcm',
      'content-length': encrypted.ciphertext.byteLength.toString(),
      'content-type': 'application/octet-stream',
    },
    method: 'post',
    body: encrypted.ciphertext,
  };
}
