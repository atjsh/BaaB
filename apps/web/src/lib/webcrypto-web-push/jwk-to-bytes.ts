/**
 * Convert EC JWK to raw bytes
 */

import { decodeBase64Url } from './base64';
import { invariant } from './utils';

export function ecJwkToBytes(jwk: JsonWebKey): Uint8Array {
  invariant(jwk.x, 'jwk.x is missing');
  invariant(jwk.y, 'jwk.y is missing');

  const xBytes = new Uint8Array(decodeBase64Url(jwk.x));
  const yBytes = new Uint8Array(decodeBase64Url(jwk.y));

  // ANSI X9.62 point encoding - 0x04 for uncompressed
  const raw = [0x04, ...xBytes, ...yBytes];
  return new Uint8Array(raw);
}
