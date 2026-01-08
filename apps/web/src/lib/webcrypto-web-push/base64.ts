/**
 * Base64 encoding/decoding utilities with URL-safe format support
 */

/**
 * Decode a base64 string to ArrayBuffer
 */
export function decodeBase64(str: string): ArrayBuffer {
  const binaryString = atob(str);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encode ArrayBuffer to base64 string
 */
export function encodeBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode a URL-safe base64 string to ArrayBuffer
 */
export function decodeBase64Url(str: string): ArrayBuffer {
  return decodeBase64(str.replace(/-/g, '+').replace(/_/g, '/'));
}

/**
 * Encode ArrayBuffer to URL-safe base64 string
 */
export function encodeBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  return encodeBase64(buffer)
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
    .replace(/=+$/, '');
}

/**
 * Convert URL-safe base64 string to object
 */
export function base64UrlToObject<T = any>(str: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(str)));
}

/**
 * Convert object to URL-safe base64 string
 */
export function objectToBase64Url(obj: any): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}
