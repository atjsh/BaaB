/**
 * Create info strings for HKDF key derivation
 */

import { encodeLength } from './utils';

/**
 * Create info string for key derivation
 */
export function createInfo(
  clientPublic: Uint8Array,
  serverPublic: Uint8Array,
  type: string,
): Uint8Array {
  return new Uint8Array([
    ...new TextEncoder().encode(`Content-Encoding: ${type}\0`),
    ...new TextEncoder().encode('P-256\0'),
    ...encodeLength(clientPublic.byteLength),
    ...clientPublic,
    ...encodeLength(serverPublic.byteLength),
    ...serverPublic,
  ]);
}

/**
 * Create simplified info string
 */
export function createInfo2(type: string): Uint8Array {
  return new Uint8Array([...new TextEncoder().encode(`Content-Encoding: ${type}\0`)]);
}
