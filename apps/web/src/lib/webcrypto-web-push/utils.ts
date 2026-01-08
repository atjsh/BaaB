/**
 * Utility functions for Web Push encryption
 */

/**
 * Flatten array of Uint8Array into a single Uint8Array
 */
export function flattenUint8Array(arrays: Uint8Array[]): Uint8Array {
  const flatNumberArray = arrays.reduce((accum: number[], arr) => {
    accum.push(...arr);
    return accum;
  }, []);
  return new Uint8Array(flatNumberArray);
}

/**
 * Convert value to Big Endian 16-bit representation
 */
export function be16(val: number): number {
  // present an 8bit value as a Big Endian 16bit value
  // eslint-disable-next-line no-bitwise
  return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}

/**
 * Split array into chunks of specified size
 */
export function arrayChunk(arr: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  const arrayLength = arr.length;
  let i = 0;
  while (i < arrayLength) {
    chunks.push(arr.slice(i, (i += chunkSize)));
  }
  return chunks;
}

/**
 * Generate a 96-bit nonce/IV for use in GCM, 48-bits of which are populated
 */
export function generateNonce(base: Uint8Array, index: number): Uint8Array {
  const nonce = base.slice(0, 12);
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < 6; ++i) {
    // eslint-disable-next-line no-bitwise
    nonce[nonce.length - 1 - i] ^= (index / 256 ** i) & 0xff;
  }
  return nonce;
}

/**
 * Encode length as 2-byte array
 */
export function encodeLength(int: number): Uint8Array {
  return new Uint8Array([0, int]);
}

/**
 * Throw error if condition is falsy
 */
export function invariant(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
