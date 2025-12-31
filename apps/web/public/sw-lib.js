// --- Base64Url Helpers ---
function toBase64Url(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// --- Helpers ---

const importHMACKey = async (keyData) =>
  crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

const signHMAC = async (key, data) => new Uint8Array(await crypto.subtle.sign('HMAC', key, data));

async function hkdfExtract(salt, ikm) {
  const key = await importHMACKey(salt);
  return await signHMAC(key, ikm);
}

async function hkdfExpand(prk, info, length) {
  const key = await importHMACKey(prk);
  const result = new Uint8Array(length);
  let t = new Uint8Array(0);
  const counter = new Uint8Array([0]);
  for (let i = 0; i < length; i += 32) {
    counter[0]++;
    t = await signHMAC(key, concat(t, info, counter));
    result.set(t.subarray(0, Math.min(32, length - i)), i);
  }
  return result.slice(0, length);
}

function concat(...arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    const chunk = ArrayBuffer.isView(arr)
      ? new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
      : new Uint8Array(arr);
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// Helper function for aesgcm info creation
function createHeader(opts) {
  const encoder = new TextEncoder();
  const toUint8 = (b) =>
    ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b);
  const clientPub = toUint8(opts.clientPublicKey);
  const localPub = toUint8(opts.localPublicKey);
  const salt = toUint8(opts.salt);

  if (opts.algorithm === 'aesgcm') {
    return concat(
      encoder.encode(`Content-Encoding: ${opts.algorithm}\0`),
      encoder.encode('P-256\0'),
      new Uint8Array(new Uint16Array([clientPub.byteLength]).buffer),
      clientPub,
      new Uint8Array(new Uint16Array([localPub.byteLength]).buffer),
      localPub,
    );
  }
  if (opts.algorithm === 'aes128gcm') {
    return concat(
      salt,
      new Uint8Array(new Uint32Array([4096]).buffer), // 4 bytes for record size
      new Uint8Array([localPub.byteLength]), // 1 byte for key length
      localPub,
    );
  }
  throw new Error('Invalid algorithm');
}

function createNonceInfo(opts) {
  const encoder = new TextEncoder();
  const toUint8 = (b) =>
    ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b);
  const clientPub = toUint8(opts.clientPublicKey);
  const localPub = toUint8(opts.localPublicKey);

  if (opts.algorithm === 'aesgcm') {
    return concat(
      encoder.encode('Content-Encoding: nonce\0'),
      encoder.encode('P-256\0'),
      new Uint8Array(new Uint16Array([clientPub.byteLength]).buffer),
      clientPub,
      new Uint8Array(new Uint16Array([localPub.byteLength]).buffer),
      localPub,
    );
  }
  if (opts.algorithm === 'aes128gcm') {
    return encoder.encode('Content-Encoding: nonce\0');
  }
  throw new Error('Invalid algorithm');
}

function createCEKInfo(algorithm) {
  const encoder = new TextEncoder();
  if (algorithm === 'aesgcm') {
    return encoder.encode('Content-Encoding: aesgcm\0');
  }
  if (algorithm === 'aes128gcm') {
    return encoder.encode('Content-Encoding: aes128gcm\0');
  }
  throw new Error('Invalid algorithm');
}

// --- JWT ---

async function signJWT(header, payload, privateKey) {
  const encoder = new TextEncoder();
  // Encode header and payload
  const encodedHeader = toBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  // Create the content to be signed
  const content = `${encodedHeader}.${encodedPayload}`;
  // Sign the content
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    encoder.encode(content),
  );
  // Convert the signature to base64url
  const encodedSignature = toBase64Url(signature);
  // Combine all parts to form the JWT
  return `${content}.${encodedSignature}`;
}

async function createJWT(privateVapidKey, endpoint, email) {
  const aud = endpoint.origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours from now
  const sub = `mailto:${email}`;
  return await signJWT(
    { alg: 'ES256', typ: 'JWT' },
    {
      aud,
      exp,
      sub,
    },
    privateVapidKey,
  );
}

// --- Encrypt ---

async function encryptPayload(payload, keys, options) {
  const encoder = new TextEncoder();
  // Step 1: Gather the necessary keys
  const userAgentPublicKey = typeof keys.p256dh === 'string' ? fromBase64Url(keys.p256dh) : keys.p256dh;
  const authSecret = typeof keys.auth === 'string' ? fromBase64Url(keys.auth) : keys.auth;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Step 2: Generate a new ECDH key pair
  const keyPair =
    options.appServerKeyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const localPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  // Step 3: Perform ECDH to get the shared secret
  const userAgentPublicKeyObject = await crypto.subtle.importKey(
    'raw',
    userAgentPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userAgentPublicKeyObject },
    keyPair.privateKey,
    256,
  );
  // Step 4: Derive the PRK
  const prk = await hkdfExtract(authSecret, sharedSecret);
  // Step 5: Create the info string and derive the IKM
  let keyInfo;
  if (options.algorithm === 'aes128gcm') {
    keyInfo = concat(encoder.encode('WebPush: info\0'), userAgentPublicKey, localPublicKey);
  } else {
    keyInfo = concat(encoder.encode('Content-Encoding: auth\0'), new Uint8Array(0));
  }
  const ikm = await hkdfExpand(prk, keyInfo, 32);
  // Step 6: Derive the Content Encryption Key and nonce
  const cekInfo = createCEKInfo(options.algorithm);
  const nonceInfo = createNonceInfo({
    algorithm: options.algorithm,
    clientPublicKey: userAgentPublicKey,
    localPublicKey,
  });
  const prk2 = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk2, cekInfo, 16);
  const nonce = await hkdfExpand(prk2, nonceInfo, 12);
  // Step 7: Encrypt the payload
  const paddedPayload = concat(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']),
    paddedPayload,
  );
  // Step 8: Assemble the encrypted payload with correct header
  const header = createHeader({
    algorithm: options.algorithm,
    clientPublicKey: userAgentPublicKey,
    localPublicKey,
    salt,
  });
  // Ensure that the ciphertext length doesn't exceed the record size
  if (ciphertext.byteLength > 4096 - 16) {
    // 16 is for auth tag
    throw new Error('Payload too large for single record');
  }
  const encryptedPayload = concat(header, new Uint8Array(ciphertext));
  return {
    encrypted: encryptedPayload,
    salt,
    appServerPublicKey: keyPair.publicKey,
    sharedSecret,
    prk,
    ikm,
    cek,
    nonce,
  };
}

// --- Generate Headers ---

async function generateHeaders(publicVapidKey, jwt, encryptedPayload, options = { algorithm: 'aes128gcm' }) {
  const exportedPubKey = await crypto.subtle.exportKey('raw', publicVapidKey);
  const encodedPubKey = toBase64Url(exportedPubKey);
  const headers = new Headers();
  headers.append('Content-Type', 'application/octet-stream');
  headers.append('Content-Length', encryptedPayload.byteLength.toString());
  headers.append('TTL', Math.floor(options.ttl ?? 86400).toString());
  if (options.urgency) {
    headers.append('Urgency', options.urgency);
  }
  if (options.algorithm === 'aesgcm') {
    const exportedLocalPubKey = await crypto.subtle.exportKey('raw', options.appServerPubKey);
    const encodedLocalPubKey = toBase64Url(exportedLocalPubKey);
    headers.append('Authorization', `Bearer ${jwt}`);
    headers.append('Content-Encoding', 'aesgcm');
    headers.append('Crypto-Key', `p256ecdsa=${encodedPubKey};dh=${encodedLocalPubKey}`);
    headers.append('Encryption', `salt=${toBase64Url(options.salt)}`);
  } else {
    headers.append('Authorization', `vapid t=${jwt}, k=${encodedPubKey}`);
    headers.append('Content-Encoding', 'aes128gcm');
  }
  return headers;
}

// --- Main Function ---

async function encryptWebPush(options) {
  const { subscription, vapidKeyPair, payload } = options;
  const encryptionOptions = { algorithm: 'aes128gcm', ttl: options.ttl, urgency: options.urgency };

  // Use a dummy email for JWT since we are proxying.
  const emailAddress = 'dummy@example.com';

  const jwt = await createJWT(vapidKeyPair.privateKey, new URL(subscription.endpoint), emailAddress);
  const { encrypted, salt, appServerPublicKey } = await encryptPayload(payload, subscription.keys, encryptionOptions);

  const headers = await generateHeaders(vapidKeyPair.publicKey, jwt, encrypted, {
    ...encryptionOptions,
    appServerPubKey: appServerPublicKey,
    salt,
  });

  // Convert Headers to plain object
  const headersObj = {};
  headers.forEach((value, key) => {
    headersObj[key] = value;
  });

  return {
    endpoint: subscription.endpoint,
    body: encrypted,
    headers: headersObj,
  };
}

async function deserializeVapidKeys(keys) {
  const publicKey = await crypto.subtle.importKey(
    'raw',
    fromBase64Url(keys.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    fromBase64Url(keys.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
  return { publicKey, privateKey };
}

// --- IndexedDB Helpers ---
const DB_NAME = 'baab-db';
const DB_VERSION = 1;
const STORES = ['config', 'clients', 'assets'];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      });
    };
  });
}

async function dbPut(storeName, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbClear(storeName) {
   const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
