#!/usr/bin/env node
/**
 * One-off migration: encrypt any UserApiKey rows that are still stored as
 * plaintext (created before the AES-256-GCM envelope existed).
 *
 * Safe to run multiple times; already-encrypted rows are skipped.
 * Usage: npm run build && npm run db:encrypt-keys
 */
import 'dotenv/config';
import prismaModule from '../dist/lib/prisma.js';
import cryptoModule from '../dist/lib/crypto.js';

const prisma = prismaModule.default ?? prismaModule;
const { encryptApiKey, isEncryptedApiKey } = cryptoModule;

const keys = await prisma.userApiKey.findMany({
  select: { id: true, userId: true, provider: true, apiKey: true },
});

let upgraded = 0;
for (const key of keys) {
  if (isEncryptedApiKey(key.apiKey)) continue;

  await prisma.userApiKey.update({
    where: { id: key.id },
    data: { apiKey: encryptApiKey(key.apiKey, key.userId, key.provider) },
  });
  upgraded += 1;
  console.log(`encrypted key for provider "${key.provider}"`);
}

console.log(`\n${upgraded} key(s) encrypted; ${keys.length - upgraded} already encrypted.`);
await prisma.$disconnect();
