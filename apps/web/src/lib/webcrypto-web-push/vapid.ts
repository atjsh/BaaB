/**
 * Based on @block65/webcrypto-web-push
 * https://github.com/block65/webcrypto-web-push
 * Copyright 2024 Block65 Pte Ltd - MIT License
 * 
 * VAPID headers generation for Web Push authentication
 */

import { decodeBase64Url, encodeBase64Url } from './base64';
import { sign } from './jwt-sign';
import type { PushSubscription, VapidKeys } from './types';
import { invariant } from './utils';

export async function vapidHeaders(subscription: PushSubscription, vapid: VapidKeys) {
  invariant(vapid.subject, 'Vapid subject is empty');
  invariant(vapid.privateKey, 'Vapid private key is empty');
  invariant(vapid.publicKey, 'Vapid public key is empty');

  const vapidPublicKeyBytes = decodeBase64Url(vapid.publicKey);

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: encodeBase64Url(vapidPublicKeyBytes.slice(1, 33)),
      y: encodeBase64Url(vapidPublicKeyBytes.slice(33, 65)),
      d: vapid.privateKey,
    },
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign'],
  );

  const jwt = await sign(
    {
      aud: new URL(subscription.endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: vapid.subject,
    },
    publicKey,
    {
      algorithm: 'ES256',
    },
  );

  return {
    headers: {
      authorization: `WebPush ${jwt}`,
      'crypto-key': `p256ecdsa=${vapid.publicKey}`,
    },
  };
}
