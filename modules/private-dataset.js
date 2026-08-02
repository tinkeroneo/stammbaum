const privateDatasetAad = 'stammbaum-private-v1';
const minimumIterations = 100_000;
const maximumIterations = 2_000_000;

function decodeBase64(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function validateEnvelope(envelope) {
  if (!envelope || envelope.version !== 1
    || envelope.algorithm !== 'AES-256-GCM'
    || envelope.kdf !== 'PBKDF2-SHA-256'
    || envelope.aad !== privateDatasetAad) throw new Error('invalid-private-envelope');
  const iterations = Number(envelope.iterations);
  if (!Number.isInteger(iterations) || iterations < minimumIterations || iterations > maximumIterations) {
    throw new Error('invalid-private-kdf');
  }
  if (!envelope.salt || !envelope.iv || !envelope.ciphertext) throw new Error('invalid-private-envelope');
  return iterations;
}

export async function decryptPrivateDataset(envelope, passphrase) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('webcrypto-unavailable');
  }
  const secret = String(passphrase || '');
  if (!secret) throw new Error('missing-passphrase');
  const iterations = validateEnvelope(envelope);
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey({
    name: 'PBKDF2',
    salt: decodeBase64(envelope.salt),
    iterations,
    hash: 'SHA-256'
  }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: decodeBase64(envelope.iv),
    additionalData: encoder.encode(privateDatasetAad),
    tagLength: 128
  }, key, decodeBase64(envelope.ciphertext));
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!parsed || !Array.isArray(parsed.people)) throw new Error('invalid-private-dataset');
  return parsed;
}

export async function fetchAndDecryptPrivateDataset({
  url = 'private/Bodensteiner.enc.json',
  passphrase,
  fetchImpl = fetch
} = {}) {
  const response = await fetchImpl(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error('private-dataset-unavailable');
  return decryptPrivateDataset(await response.json(), passphrase);
}
