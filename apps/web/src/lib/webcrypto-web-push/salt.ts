/**
 * Generate random salt for encryption
 */

export async function getSalt(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(16));
}
