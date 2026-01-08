/**
 * Based on @block65/webcrypto-web-push
 * https://github.com/block65/webcrypto-web-push
 * Copyright 2024 Block65 Pte Ltd - MIT License
 * 
 * Generate random salt for encryption
 */

export async function getSalt(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(16));
}
