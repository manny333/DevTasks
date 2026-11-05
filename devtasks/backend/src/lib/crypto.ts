import crypto from 'crypto';

/**
 * AES-256-GCM envelope for AI provider keys.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url), with the owner and provider
 * bound as additional authenticated data so a ciphertext cannot be copied to
 * another user's row.
 */

const VERSION = 'v1';
const AAD_PREFIX = 'kanvy-api-key';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const MIN_SECRET_LENGTH = 16;

let warnedAboutFallback = false;

function encryptionSecret(): string {
  const dedicated = process.env.API_KEY_ENCRYPTION_SECRET?.trim();
  if (dedicated) {
    if (dedicated.length < MIN_SECRET_LENGTH) {
      throw new Error(`API_KEY_ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    return dedicated;
  }

  const fallback = process.env.JWT_SECRET?.trim();
  if (!fallback) {
    throw new Error('API_KEY_ENCRYPTION_SECRET (or JWT_SECRET) is required to encrypt AI API keys');
  }
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn('[crypto] API_KEY_ENCRYPTION_SECRET is not set; falling back to JWT_SECRET');
  }
  return fallback;
}

function deriveKey(secret: string): Buffer {
  // HKDF is appropriate here: the input is already a high-entropy secret.
  const derived = crypto.hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('kanvy-api-keys', 'utf8'),
    Buffer.from(`${AAD_PREFIX}:${VERSION}`, 'utf8'),
    KEY_BYTES
  );
  return Buffer.from(derived);
}

function additionalData(userId: string, provider: string): Buffer {
  return Buffer.from(`${AAD_PREFIX}:${VERSION}:${userId}:${provider}`, 'utf8');
}

/** True when the stored value already uses the encrypted envelope. */
export function isEncryptedApiKey(value: string): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`);
}

/** Encrypts a plaintext provider key for a given owner and provider. */
export function encryptApiKey(plaintext: string, userId: string, provider: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Cannot encrypt an empty API key');
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(encryptionSecret()), iv);
  cipher.setAAD(additionalData(userId, provider));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Decrypts a stored value. Legacy plaintext rows are returned unchanged so the
 * caller can upgrade them lazily.
 */
export function decryptApiKey(value: string, userId: string, provider: string): string {
  if (!isEncryptedApiKey(value)) return value;

  const parts = value.split('.');
  if (parts.length !== 4) throw new Error('Malformed encrypted API key');
  const [, ivPart, tagPart, dataPart] = parts;
  if (!ivPart || !tagPart || !dataPart) throw new Error('Malformed encrypted API key');

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveKey(encryptionSecret()),
      Buffer.from(ivPart, 'base64url')
    );
    decipher.setAAD(additionalData(userId, provider));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return plaintext;
  } catch {
    // Never surface crypto details; the caller only needs to know it failed.
    throw new Error('Could not decrypt the stored API key (secret changed or data corrupted)');
  }
}
