import prisma from './prisma';
import { decryptApiKey, encryptApiKey, isEncryptedApiKey } from './crypto';

/**
 * Returns the plaintext provider key for a user, decrypting it on the fly.
 * Legacy plaintext rows (pre-encryption) are upgraded in place.
 */
export async function getDecryptedUserApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  const row = await prisma.userApiKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!row) return null;

  const plaintext = decryptApiKey(row.apiKey, userId, provider);

  if (!isEncryptedApiKey(row.apiKey)) {
    try {
      await prisma.userApiKey.update({
        where: { id: row.id },
        data: { apiKey: encryptApiKey(plaintext, userId, provider) },
      });
      console.log(`[api-keys] upgraded legacy plaintext key for provider "${provider}"`);
    } catch (error) {
      console.error('[api-keys] failed to upgrade legacy key:', error);
    }
  }

  return plaintext;
}

/** Encrypts and upserts a provider key for a user. */
export async function saveUserApiKey(
  userId: string,
  provider: string,
  apiKey: string,
  label: string | null
) {
  const plaintext = apiKey.trim();
  if (plaintext.length === 0) throw new Error('API key is required');
  if (plaintext.length > 8192) throw new Error('API key is too long');

  const encrypted = encryptApiKey(plaintext, userId, provider);

  return prisma.userApiKey.upsert({
    where: { userId_provider: { userId, provider } },
    update: { apiKey: encrypted, label, isActive: true },
    create: { provider, apiKey: encrypted, label, userId },
  });
}
