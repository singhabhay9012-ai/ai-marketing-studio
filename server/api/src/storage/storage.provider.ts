export interface SignedRequest {
  url: string;
  method: 'PUT' | 'GET';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface ObjectInfo {
  size: number;
  contentType?: string;
}

/**
 * Storage provider abstraction (blueprint §4). Product code depends only on
 * this interface; drivers can be swapped by configuration.
 */
export interface StorageProvider {
  createUploadUrl(key: string, opts: { contentType: string; maxBytes: number; expiresInSec?: number }): Promise<SignedRequest>;
  createDownloadUrl(key: string, opts?: { expiresInSec?: number; fileName?: string }): Promise<SignedRequest>;
  head(key: string): Promise<ObjectInfo | null>;
  /** Reads the first `bytes` of an object (for magic-number sniffing). */
  readHead(key: string, bytes: number): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

/** Verifies the file really is the image type it claims to be. */
export function sniffImageType(head: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
