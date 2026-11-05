import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ─── Storage Provider Interface ───────────────────────────────────────────────
// Swap LocalStorageProvider for AzureBlobStorageProvider (or S3, GCS, etc.)
// without changing any route code.

export interface StorageProvider {
  /** Save a file buffer and return the storageKey (used later to retrieve/delete) */
  save(buffer: Buffer, originalName: string, mimeType: string): Promise<string>;
  /** Return the public URL or signed URL to access the file */
  getUrl(storageKey: string): string;
  /** Delete the file from storage */
  delete(storageKey: string): Promise<void>;
}

// ─── Local Storage Implementation ────────────────────────────────────────────

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure folder exists on startup
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * The stored extension is derived from the verified MIME type, never from the
 * client-provided filename: that is what prevents an uploaded `.html`/`.svg`
 * from being served as executable markup.
 */
export const UPLOAD_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export function isAllowedMime(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(UPLOAD_EXTENSIONS, mimeType);
}

const MAGIC_CHECKS: { mime: string; test: (buffer: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/gif',
    test: (b) => {
      if (b.length < 6) return false;
      const header = b.subarray(0, 6).toString('ascii');
      return header === 'GIF87a' || header === 'GIF89a';
    },
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'application/pdf',
    test: (b) => b.length >= 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
];

/** Verifies the real file signature matches the declared MIME type. */
export function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const check = MAGIC_CHECKS.find((entry) => entry.mime === mimeType);
  return check ? check.test(buffer) : false;
}

// ─── Signed URLs ─────────────────────────────────────────────────────────────
// Uploads are no longer served as plain static files: every URL carries an
// HMAC signature and an expiry, so a leaked or guessed key is not enough.

const URL_SECRET = process.env.UPLOADS_SECRET || process.env.JWT_SECRET || 'dev-uploads-secret';
const URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signUpload(key: string, exp: number): string {
  return crypto.createHmac('sha256', URL_SECRET).update(`${key}:${exp}`).digest('base64url');
}

export function verifyUploadSignature(key: string, exp: number, sig: string): boolean {
  if (!key || !Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  const expected = Buffer.from(signUpload(key, exp));
  const provided = Buffer.from(sig);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

/** Resolves a storage key inside the upload dir, or null when it is unsafe. */
export function resolveUploadPath(key: string): string | null {
  if (!/^[A-Za-z0-9_-]+\.[a-z0-9]{2,5}$/.test(key)) return null;
  const root = path.resolve(UPLOAD_DIR);
  const resolved = path.resolve(root, key);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

export class LocalStorageProvider implements StorageProvider {
  async save(buffer: Buffer, _originalName: string, mimeType: string): Promise<string> {
    const ext = UPLOAD_EXTENSIONS[mimeType];
    if (!ext) throw new Error(`Unsupported file type: ${mimeType}`);
    const key = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, key), buffer);
    return key;
  }

  getUrl(storageKey: string): string {
    const exp = Date.now() + URL_TTL_MS;
    return `/uploads/${storageKey}?exp=${exp}&sig=${signUpload(storageKey, exp)}`;
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = resolveUploadPath(storageKey);
    if (filePath && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

// ─── Future: Azure Blob Storage ───────────────────────────────────────────────
// import { BlobServiceClient } from '@azure/storage-blob';
//
// export class AzureBlobStorageProvider implements StorageProvider {
//   private client: BlobServiceClient;
//   private container: string;
//
//   constructor() {
//     this.client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING!);
//     this.container = process.env.AZURE_STORAGE_CONTAINER!;
//   }
//
//   async save(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
//     const ext = UPLOAD_EXTENSIONS[mimeType] ?? '';
//     const key = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
//     const blockBlobClient = this.client.getContainerClient(this.container).getBlockBlobClient(key);
//     await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType } });
//     return key;
//   }
//
//   getUrl(storageKey: string): string {
//     return `https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${this.container}/${storageKey}`;
//   }
//
//   async delete(storageKey: string): Promise<void> {
//     await this.client.getContainerClient(this.container).getBlockBlobClient(storageKey).delete();
//   }
// }

// ─── Active Provider (swap here when migrating) ───────────────────────────────
export const storage: StorageProvider = new LocalStorageProvider();
