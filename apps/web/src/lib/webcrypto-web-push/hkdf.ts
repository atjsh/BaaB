/**
 * HMAC-based Extract-and-Expand Key Derivation Function (HKDF)
 * Implementation for Web Push encryption
 */

const SHA256_HASH_LENGTH = 32;

/**
 * Create HMAC hash function
 */
function createHMAC(data: Uint8Array) {
  if (data.byteLength === 0) {
    return {
      hash: () => Promise.resolve(new Uint8Array(SHA256_HASH_LENGTH)),
    };
  }

  const keyPromise = crypto.subtle.importKey(
    'raw',
    data as BufferSource,
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    true,
    ['sign'],
  );

  return {
    hash: async (input: Uint8Array): Promise<ArrayBuffer> => {
      const k = await keyPromise;
      return crypto.subtle.sign('HMAC', k, input as BufferSource);
    },
  };
}

/**
 * HKDF key derivation
 */
export async function hkdf(salt: Uint8Array | ArrayBuffer, ikm: ArrayBuffer) {
  const saltArray = salt instanceof Uint8Array ? salt : new Uint8Array(salt);
  const prkhPromise = createHMAC(saltArray)
    .hash(new Uint8Array(ikm))
    .then((prk) => createHMAC(new Uint8Array(prk)));

  return {
    extract: async (info: Uint8Array, len: number) => {
      const input = new Uint8Array([...info, 1]);
      const prkh = await prkhPromise;
      const hash = await prkh.hash(input);
      return hash.slice(0, len);
    },
  };
}
