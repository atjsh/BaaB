/**
 * Based on @block65/webcrypto-web-push
 * https://github.com/block65/webcrypto-web-push
 * Copyright 2024 Block65 Pte Ltd - MIT License
 * 
 * JWT signing for VAPID authentication
 */

import { encodeBase64Url, objectToBase64Url } from './base64';
import { algorithms, type Algorithm } from './jwt-algorithms';

export interface SignOptions {
  algorithm: Algorithm;
  kid?: string;
}

export async function sign(payload: any, key: CryptoKey, options: SignOptions): Promise<string> {
  if (payload === null || typeof payload !== 'object') {
    throw new Error('payload must be an object');
  }

  if (!(key instanceof CryptoKey)) {
    throw new Error('key must be a CryptoKey');
  }

  if (typeof options.algorithm !== 'string') {
    throw new Error('options.algorithm must be a string');
  }

  const headerStr = objectToBase64Url({
    typ: 'JWT',
    alg: options.algorithm,
    ...(options.kid && { kid: options.kid }),
  });

  const payloadStr = objectToBase64Url({
    iat: Math.floor(Date.now() / 1000),
    ...payload,
  });

  const dataStr = `${headerStr}.${payloadStr}`;

  const signature = await crypto.subtle.sign(
    algorithms[options.algorithm],
    key,
    new TextEncoder().encode(dataStr),
  );

  return `${dataStr}.${encodeBase64Url(signature)}`;
}
