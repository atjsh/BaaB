/**
 * Based on @block65/webcrypto-web-push
 * https://github.com/block65/webcrypto-web-push
 * Copyright 2024 Block65 Pte Ltd - MIT License
 * 
 * Notification encryption for Web Push using aesgcm
 * See https://developer.chrome.com/blog/web-push-encryption/
 */

import { deriveClientKeys } from './client-keys';
import { hkdf } from './hkdf';
import { createInfo, createInfo2 } from './info';
import { ecJwkToBytes } from './jwk-to-bytes';
import { generateLocalKeys } from './local-keys';
import { getSalt } from './salt';
import type { PushSubscription } from './types';
import { arrayChunk, be16, flattenUint8Array, generateNonce } from './utils';

export async function encryptNotification(subscription: PushSubscription, plaintext: Uint8Array) {
  const clientKeys = await deriveClientKeys(subscription);
  const salt = await getSalt();

  // Local ephemeral keys
  const localKeys = await generateLocalKeys();
  const localPublicKeyBytes = ecJwkToBytes(localKeys.publicJwk);

  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: clientKeys.publicKey,
    },
    localKeys.privateKey,
    256,
  );

  // Infos
  const cekInfo = createInfo(clientKeys.publicBytes, localPublicKeyBytes, 'aesgcm');
  const nonceInfo = createInfo(clientKeys.publicBytes, localPublicKeyBytes, 'nonce');
  const keyInfo = createInfo2('auth');

  // Encrypt
  const ikmHkdf = await hkdf(clientKeys.authSecretBytes, sharedSecret);
  const ikm = await ikmHkdf.extract(keyInfo, 32);
  const messageHkdf = await hkdf(salt, ikm as ArrayBuffer);
  const cekBytes = await messageHkdf.extract(cekInfo, 16);
  const nonceBytes = await messageHkdf.extract(nonceInfo, 12);

  const cekCryptoKey = await crypto.subtle.importKey(
    'raw',
    cekBytes,
    {
      name: 'AES-GCM',
      length: 128,
    },
    false,
    ['encrypt'],
  );

  const cipherChunks = await Promise.all(
    arrayChunk(plaintext, 4095).map(async (chunk, idx) => {
      const padSize = 0;
      const x = new Uint16Array([be16(padSize)]);
      const padded = new Uint8Array([
        ...new Uint8Array(x.buffer, x.byteOffset, x.byteLength),
        ...chunk,
      ]);

      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: generateNonce(new Uint8Array(nonceBytes), idx) as BufferSource,
        },
        cekCryptoKey,
        padded as BufferSource,
      );

      return new Uint8Array(encrypted);
    }),
  );

  return {
    ciphertext: flattenUint8Array(cipherChunks),
    salt,
    localPublicKeyBytes,
  };
}
