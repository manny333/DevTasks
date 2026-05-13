import path from 'path';
import fs from 'fs';

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

export class LocalStorageProvider implements StorageProvider {
  async save(buffer: Buffer, originalName: string, _mimeType: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, key), buffer);
    return key;
  }

  getUrl(storageKey: string): string {
    // Served by Express static middleware at /uploads/:key
    return `/uploads/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(UPLOAD_DIR, storageKey);
    if (fs.existsSync(filePath)) {
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
//     const ext = path.extname(originalName).toLowerCase();
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
