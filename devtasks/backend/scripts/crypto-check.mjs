#!/usr/bin/env node
/**
 * Crypto checks for the API-key envelope. Runs against the compiled library,
 * so it exercises exactly what the server ships.
 *
 * Usage: npm run build && npm run test:crypto
 */
import cryptoModule from '../dist/lib/crypto.js';

const { encryptApiKey, decryptApiKey, isEncryptedApiKey } = cryptoModule;

process.env.API_KEY_ENCRYPTION_SECRET ||= 'test-encryption-secret-0123456789';

const userId = 'user_test';
const provider = 'openai';
const plaintext = 'sk-test-1234567890abcdef';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

function expectThrow(name, fn) {
  try {
    fn();
  } catch {
    return; // expected
  }
  throw new Error(name);
}

const envelope = encryptApiKey(plaintext, userId, provider);

check('produces a v1 envelope', () => {
  if (!isEncryptedApiKey(envelope)) throw new Error('not marked as encrypted');
  if (envelope.split('.').length !== 4) throw new Error('unexpected format');
});

check('roundtrips', () => {
  if (decryptApiKey(envelope, userId, provider) !== plaintext) throw new Error('value mismatch');
});

check('does not embed the plaintext', () => {
  if (envelope.includes(plaintext)) throw new Error('plaintext leaked into envelope');
});

check('binds the owner (AAD)', () => {
  expectThrow('decrypted for another user', () => decryptApiKey(envelope, 'other_user', provider));
});

check('binds the provider (AAD)', () => {
  expectThrow('decrypted for another provider', () => decryptApiKey(envelope, userId, 'deepseek'));
});

check('detects tampering', () => {
  const parts = envelope.split('.');
  parts[3] = `${parts[3].slice(0, -2)}AA`;
  expectThrow('tampered payload accepted', () => decryptApiKey(parts.join('.'), userId, provider));
});

check('rejects malformed envelopes', () => {
  expectThrow('malformed envelope accepted', () => decryptApiKey('v1.only-two', userId, provider));
});

check('passes legacy plaintext through', () => {
  if (decryptApiKey('sk-legacy-plain', userId, provider) !== 'sk-legacy-plain') {
    throw new Error('legacy value was modified');
  }
  if (isEncryptedApiKey('sk-legacy-plain')) throw new Error('legacy value marked encrypted');
});

check('refuses to encrypt empty values', () => {
  expectThrow('empty value accepted', () => encryptApiKey('', userId, provider));
});

for (const result of results) {
  console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}${result.ok ? '' : `: ${result.error}`}`);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} crypto checks passed.`);
if (failed.length > 0) process.exitCode = 1;
